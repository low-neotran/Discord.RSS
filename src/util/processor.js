const connectDb = require('../util/connectDatabase.js')
const createLogger = require('./logger/create.js')
const FeedFetcher = require('../util/FeedFetcher.js')
const RequestError = require('../structs/errors/RequestError.js')
const FeedParserError = require('../structs/errors/FeedParserError.js')
const LinkLogic = require('../structs/LinkLogic.js')
const initialize = require('./initialization.js')
const databaseFuncs = require('../util/database.js')

async function fetchFeed (headers, url, log) {
  if (log) {
    log.info('Fetching URL')
  }
  const fetchOptions = {}
  if (headers) {
    if (!headers.lastModified || !headers.etag) {
      throw new Error(`Headers exist for a link, but missing lastModified and etag (${url})`)
    }
    fetchOptions.headers = {
      'If-Modified-Since': headers.lastModified,
      'If-None-Match': headers.etag
    }
  }
  const { stream, response } = await FeedFetcher.fetchURL(url, fetchOptions)
  if (response.status === 304) {
    if (log) {
      log.info('304 response, sending success status')
    }
    return null
  } else {
    const lastModified = response.headers['last-modified']
    const etag = response.headers.etag

    if (lastModified && etag) {
      process.send({
        status: 'headers',
        link: url,
        lastModified,
        etag
      })
      if (log) {
        log.info('Sending back headers')
      }
    }
    return {
      stream,
      response
    }
  }
}

async function parseStream (stream, charset, url, log) {
  if (log) {
    log.info('Parsing stream')
  }
  const { articleList } = await FeedFetcher.parseStream(stream, url, charset)
  if (articleList.length === 0) {
    if (log) {
      log.info('No articles found, sending success status')
    }
    return null
  }
  return articleList
}

async function syncDatabase (articleList, databaseDocs, feeds, meta, isDatabaseless) {
  const allComparisons = new Set()
  for (const feedID in feeds) {
    const feed = feeds[feedID]
    feed.ncomparisons.forEach(v => allComparisons.add(v))
    feed.pcomparisons.forEach(v => allComparisons.add(v))
  }
  const {
    toInsert,
    toUpdate
  } = await databaseFuncs.getInsertsAndUpdates(
    articleList,
    databaseDocs,
    Array.from(allComparisons),
    meta
  )

  const memoryCollection = isDatabaseless ? databaseDocs : undefined
  await databaseFuncs.insertDocuments(toInsert, memoryCollection)
  await databaseFuncs.updateDocuments(toUpdate, memoryCollection)
}

async function sendArticles (articles, log) {
  /**
   * Articles should be stored as pending first so that in
   * case the bot shuts down while sending articles,
   * they can still be retrieved from the database.
   */
  const promises = articles.map(article => {
    return databaseFuncs.storePendingArticle(article)
  })
  const results = await Promise.allSettled(promises)
  const len = results.length
  for (var i = 0; i < len; ++i) {
    const result = results[i]
    if (result.status === 'rejected') {
      log.error(result.reason, 'Failed to store pending article before process.send')
    }
    process.send({
      status: 'pendingArticle',
      pendingArticle: result.value
    })
  }
}

async function getFeed (data, log) {
  const { link, rssList, headers, toDebug, docs, memoryCollections, scheduleName, runNum, config } = data
  const isDatabaseless = !!memoryCollections
  const urlLog = toDebug ? log.child({
    url: link
  }) : null
  if (urlLog) {
    urlLog.info('Isolated processor received in batch')
  }
  try {
    const fetchData = await fetchFeed(headers[link], link, urlLog)
    if (!fetchData) {
      process.send({ status: 'success', link })
      return
    }
    const { stream, response } = fetchData
    const charset = FeedFetcher.getCharsetFromResponse(response)
    const articleList = await parseStream(stream, charset, link, urlLog)
    if (!articleList) {
      process.send({ status: 'success', link })
      return
    }

    /**
     * Run the logic to get any new articles before syncDatabase modifies
     * databaseless memory collections in-place
     *
     * Any new n/p comparisons are also delayed by 1 cycle since docs
     * are fetched before getFeed (before they're updated below this)
     */
    const logic = new LinkLogic({ articleList, ...data })
    const result = await logic.run(docs)
    const newArticles = result.newArticles

    /**
     * Then sync the database
     */
    const meta = {
      feedURL: link,
      scheduleName
    }
    await syncDatabase(articleList, docs, rssList, meta, isDatabaseless)

    /**
     * Then finally send new articles to prevent spam if sync fails
     */
    if (runNum !== 0 || config.feeds.sendFirstCycle === true) {
      if (urlLog) {
        urlLog.info(`Sending article status for ${newArticles.length} articles`)
      }
      await sendArticles(newArticles, log)
    }

    process.send({
      status: 'success',
      link,
      memoryCollection: isDatabaseless ? docs : undefined
    })
  } catch (err) {
    if (urlLog) {
      urlLog.info('Sending failed status')
    }
    process.send({ status: 'failed', link, rssList })
    if (err instanceof RequestError || err instanceof FeedParserError) {
      if (config.log.linkErrs) {
        log.warn({
          error: err
        }, `Skipping ${link}`)
      }
    } else {
      log.error(err, 'Cycle logic')
    }
  }
}

async function connectToDatabase (config) {
  if (!config.database.uri.startsWith('mongo')) {
    return
  }
  const connection = await connectDb(config.database.uri, config.database.connection)
  await initialize.setupModels(connection)
}

process.on('message', async m => {
  const currentBatch = m.currentBatch
  const { debugURLs, scheduleName, memoryCollections, config } = m
  const logMarker = scheduleName
  const log = createLogger(logMarker)
  try {
    await connectToDatabase(config)
    const articleDocuments = await databaseFuncs.getAllDocuments(scheduleName, memoryCollections)
    const promises = []
    for (const link in currentBatch) {
      const docs = articleDocuments[link] || []
      const rssList = currentBatch[link]
      const toDebug = debugURLs.includes(link)
      promises.push(getFeed({ ...m, link, toDebug, rssList, docs }, log))
    }
    await Promise.all(promises)
    process.exit()
  } catch (err) {
    log.error(err, 'processor')
  }
})
