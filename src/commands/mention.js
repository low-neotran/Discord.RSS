const Discord = require('discord.js')
const filters = require('./util/filters.js')
const MenuUtils = require('../structs/MenuUtils.js')
const FeedSelector = require('../structs/FeedSelector.js')
const Translator = require('../structs/Translator.js')
const Profile = require('../structs/db/Profile.js')
const Subscriber = require('../structs/db/Subscriber.js')
const Feed = require('../structs/db/Feed.js')
const getConfig = require('../config.js').get
const createLogger = require('../util/logger/create.js')
const VALID_OPTIONS = ['1', '2', '3', '4']

async function printSubscriptions (message, feeds, translate) {
  /** @type {Discord.Guild} */
  const guild = message.guild
  const log = createLogger(guild.shard.id)
  const subList = {}
  const config = getConfig()
  const msg = new Discord.MessageEmbed()
    .setColor(config.bot.menuColor)
    .setDescription(translate('commands.mention.listSubscriptionsDescription'))
    .setAuthor(translate('commands.mention.subscriptionsList'))

  const allSubscribers = await Promise.all(feeds.map(feed => feed.getSubscribers()))
  for (let i = 0; i < allSubscribers.length; ++i) {
    const feed = feeds[i]
    const subscribers = allSubscribers[i]
    for (const subscriber of subscribers) {
      const id = subscriber.id
      const type = subscriber.type
      if (!subList[feed.title]) {
        subList[feed.title] = {}
      }
      const embedReferenceTitle = !subscriber.hasFilters() ? 'globalSubs' : 'filteredSubs'
      if (!subList[feed.title][embedReferenceTitle]) {
        subList[feed.title][embedReferenceTitle] = []
      }
      if (type === 'user') {
        try {
          const resolvedUser = await guild.members.fetch(id)
          const toInsert = `${resolvedUser.user.username}#${resolvedUser.user.discriminator}`
          if (!subList[feed.title][embedReferenceTitle].includes(toInsert)) {
            subList[feed.title][embedReferenceTitle].push(toInsert)
          }
        } catch (err) {
          log.warn({
            memberID: id,
            error: err
          }, 'Failed to fetch member')
        }
      } else if (type === 'role' && guild.roles.cache.has(id)) {
        const resolvedRole = guild.roles.cache.get(id)
        const toInsert = resolvedRole.name
        if (!subList[feed.title][embedReferenceTitle].includes(toInsert)) {
          subList[feed.title][embedReferenceTitle].push(toInsert)
        }
      }
    }
  }

  if (Object.keys(subList).length === 0) {
    return message.channel.send(translate('commands.mention.listSubscriptionsNone'))
  }
  for (const feed in subList) {
    let list = ''
    const globalSubs = []
    for (const globalSubber in subList[feed].globalSubs) {
      globalSubs.push(subList[feed].globalSubs[globalSubber])
    }
    globalSubs.sort()
    if (globalSubs.length > 0) {
      list += translate('commands.mention.globalSubscribers') + globalSubs.join('\n')
    }

    const filteredSubs = []
    for (const filteredSubber in subList[feed].filteredSubs) {
      filteredSubs.push(subList[feed].filteredSubs[filteredSubber])
    }
    filteredSubs.sort()
    if (filteredSubs.length > 0) {
      list += (globalSubs.length > 0 ? '\n' : '') + translate('commands.mention.filteredSubscribers') + filteredSubs.join('\n')
    }
    if (!list) {
      continue
    }
    if (list.length <= 1024) {
      msg.addField(feed, list)
    } else {
      const lines = list.split('\n')
      let curStr = ''
      for (let i = 0; i < lines.length; ++i) {
        const line = lines[i]
        if (curStr.length + line.length <= 1000) {
          curStr += line + '\n'
        } else {
          msg.addField(feed, curStr)
          curStr = line
        }
      }
      if (curStr.length > 0) {
        msg.addField(feed, curStr)
      }
    }
  }
  await message.channel.send({ embed: msg })
}

// Remove all subscriptions for a role
async function deleteSubscription (message, profile, feeds, role, user) {
  const roleID = role ? role.id : undefined
  const userID = user ? user.id : undefined
  const matchID = roleID || userID
  const config = getConfig()
  const prefix = profile && profile.prefix ? profile.prefix : config.bot.prefix
  const locale = profile ? profile.locale : undefined
  const translate = Translator.createLocaleTranslator(locale)

  const allSubscribers = await Promise.all(feeds.map(feed => feed.getSubscribers()))

  for (let i = 0; i < allSubscribers.length; ++i) {
    const subscribers = allSubscribers[i]
    if (subscribers.length === 0) {
      continue
    }
    const subscriber = subscribers.find(subscriber => subscriber.id === matchID)
    if (subscriber) {
      await subscriber.delete()
      const log = createLogger(message.guild.shard.id)
      const logBindings = {
        guild: message
      }
      if (user) {
        logBindings.user = user
      } else {
        logBindings.role = role
      }
      log.info(logBindings, 'Deleted all subscriptions')
      await message.channel.send(`${translate('commands.mention.removeSubscriptionsSuccess', {
        name: role ? role.name : user.username,
        type: role ? translate('commands.mention.role') : translate('commands.mention.user')
      })} ${translate('generics.backupReminder', { prefix })}`)
      return
    }
  }

  await message.channel.send(translate('commands.mention.removeSubscriptionsNone', {
    type: role ? translate('commands.mention.role') : translate('commands.mention.user')
  }))
}

// Add global subscriptions, called from openSubMenu
async function addGlobalSub (message, profile, feed, role, user, translate) {
  const subscribers = await feed.getSubscribers()
  const id = role ? role.id : user.id
  const name = role ? role.name : user.username
  const type = role ? 'Role' : 'User'
  const found = subscribers.find(sub => sub.id === id)
  if (found) {
    if (!found.hasFilters()) {
      return message.channel.send(translate('commands.mention.addSubscriberGlobalExists', { type, name }))
    }
    await found.removeFilters()
  } else {
    const subscriber = new Subscriber({
      feed: feed._id,
      id,
      type: type.toLowerCase()
    })
    await subscriber.save()
  }

  const config = getConfig()
  const prefix = profile && profile.prefix ? profile.prefix : config.bot.prefix
  const log = createLogger(message.guild.shard.id)
  const logBindings = {
    guild: message.guild
  }
  if (user) {
    logBindings.user = user
  } else {
    logBindings.role = role
  }
  log.info(logBindings, `Added global subscriber to feed ${feed.url}`)
  await message.channel.send(`${translate('commands.mention.addSubscriberGlobalSuccess', {
    link: feed.url,
    name,
    type: role ? translate('commands.mention.role') : translate('commands.mention.user')
  })} ${translate('generics.backupReminder', { prefix })}`)
}

// Remove global subscriptions, called from openSubMenu
async function removeGlobalSub (message, profile, feed, role, user, translate) {
  const subscribers = await feed.getSubscribers()
  if (subscribers.length === 0) {
    return message.channel.send(translate('commands.mention.removeAnySubscriberNone', { link: feed.url }))
  }
  const config = getConfig()
  const prefix = profile && profile.prefix ? profile.prefix : config.bot.prefix
  const matchID = role ? role.id : user.id
  const found = subscribers.find(sub => sub.id === matchID && !sub.hasFilters())
  if (found) {
    await found.delete()
    const log = createLogger(message.guild.shard.id)
    const logBindings = {
      guild: message.guild
    }
    if (user) {
      logBindings.user = user
    } else {
      logBindings.role = role
    }
    log.info(logBindings, `Removed global subscription for feed ${feed.url}`)
    return message.channel.send(`${translate('commands.mention.removeGlobalSubscriberSuccess', {
      type: role ? translate('commands.mention.role') : translate('commands.mention.user'),
      name: role ? role.name : `${user.username}#${user.discriminator}`,
      link: feed.url
    })} ${translate('generics.backupReminder', { prefix })}`)
  }
  await message.channel.send(translate('commands.mention.removeGlobalSubscriberExists', { link: feed.url }))
}

async function filteredSubMenuFn (m, data) {
  const { profile, feed, role, user, translate } = data
  const input = m.content // 1 = add, 2 = remove
  if (input === '1') {
    return {
      ...data,
      next: {
        series: await filters.add(m, profile, feed, role, user)
      }
    }
  } else if (input === '2') {
    const subscribers = await feed.getSubscribers()
    if (subscribers.length === 0) {
      return m.channel.send(translate('commands.mention.removeAnySubscriberNone', { link: feed.url }))
    }
    return {
      ...data,
      next: {
        series: await filters.remove(m, profile, feed, role, user)
      }
    }
  } else throw new MenuUtils.MenuOptionError()
}

async function globalSubMenuFn (m, data) {
  const { profile, feed, role, user, translate } = data
  const input = m.content // 1 = add, 2 = remove
  if (input === '1') {
    await addGlobalSub(m, profile, feed, role, user, translate)
    return data
  } else if (input === '2') {
    await removeGlobalSub(m, profile, feed, role, user, translate)
    return data
  } else throw new MenuUtils.MenuOptionError()
}

/**
 * @param {import('discord.js').Message} m
 * @param {*} data
 */
async function getUserOrRoleFn (m, data) {
  const log = createLogger(m.guild.shardID)
  const translate = data.translate
  const input = m.content
  const mention = m.mentions.roles.first()
  if (mention) {
    return {
      ...data,
      role: mention
    }
  }
  if (input === '@everyone') {
    throw new MenuUtils.MenuOptionError(translate('commands.mention.invalidRoleOrUser'))
  }
  if (m.guild.roles.cache.filter(r => r.name === input).size > 1) {
    throw new MenuUtils.MenuOptionError(translate('commands.mention.multipleRoles'))
  }
  const role = m.mentions.roles.first() || m.guild.roles.cache.find(r => r.name === input)
  let member
  if (!role) {
    try {
      member = m.mentions.members.first() || await m.guild.members.fetch(input)
    } catch (err) {
      log.warn({
        message: m,
        error: err
      }, 'No member found')
    }
  }
  if (!role && !member) {
    throw new MenuUtils.MenuOptionError(translate('commands.mention.invalidRoleOrUser'))
  }
  return {
    ...data,
    role,
    user: member ? member.user : undefined
  }
}

async function feedSelectorFn (m, data) {
  const { profile, feed, role, user } = data
  const locale = profile ? profile.locale : undefined
  const translate = Translator.createLocaleTranslator(locale)
  return {
    ...data,
    next: {
      embed: {
        description: translate('commands.mention.selectedRoleDescription', { name: role ? role.name : user.username, feedTitle: feed.title, feedLink: feed.url })
      }
    }
  }
}

async function selectOptionFn (m, data) {
  const translate = data.translate
  const optionSelected = m.content
  if (!VALID_OPTIONS.includes(optionSelected)) {
    throw new MenuUtils.MenuOptionError()
  }
  const nextData = {
    ...data,
    optionSelected
  }

  if (optionSelected === '4') {
    return nextData
  } else if (optionSelected === '3' || optionSelected === '2' || optionSelected === '1') { // Options 1, 2, and 3 requires a role or user to be acquired first
    const getUserOrRole = new MenuUtils.Menu(m, getUserOrRoleFn, { text: translate('commands.mention.promptUserOrRole') })
    if (optionSelected === '3') {
      nextData.next = {
        menu: getUserOrRole
      }
      return nextData
    }
    const { command, locale, feeds } = data
    const feedSelector = new FeedSelector(m, feedSelectorFn, {
      command,
      locale
    }, feeds)

    if (optionSelected === '2') { // Filtered Sub Menu
      const filteredSubMenu = new MenuUtils.Menu(m, filteredSubMenuFn)
        .setAuthor(translate('commands.mention.filteredSubscriptionsTitle'))
        .addOption(translate('commands.mention.filteredSubscriptionsOptionAdd'), translate('commands.mention.filteredSubscriptionsOptionAddDescription'))
        .addOption(translate('commands.mention.filteredSubscriptionsOptionRemove'), translate('commands.mention.filteredSubscriptionsOptionRemoveDescription'))
      nextData.next = { menu: [getUserOrRole, feedSelector, filteredSubMenu] }
    } else { // Global Sub Menu
      const globalSubMenu = new MenuUtils.Menu(m, globalSubMenuFn)
        .setAuthor(translate('commands.mention.globalSubscriptionsTitle'))
        .addOption(translate('commands.mention.globalSubscriptionsOptionAdd'), translate('commands.mention.globalSubscriptionsOptionAddDescription'))
        .addOption(translate('commands.mention.globalSubscriptionsOptionRemove'), translate('commands.mention.globalSubscriptionsOptionRemoveDescription'))
      nextData.next = { menu: [getUserOrRole, feedSelector, globalSubMenu] }
    }

    return nextData
  }
}

module.exports = async (message, command) => {
  const profile = await Profile.get(message.guild.id)
  const guildLocale = profile ? profile.locale : undefined
  const translate = Translator.createLocaleTranslator(guildLocale)
  const feeds = await Feed.getManyBy('guild', message.guild.id)
  if (feeds.length === 0) {
    return message.channel.send(translate('commands.mention.noFeeds'))
  }
  const config = getConfig()
  const prefix = profile && profile.prefix ? profile.prefix : config.bot.prefix

  const selectOption = new MenuUtils.Menu(message, selectOptionFn)
    .setDescription(translate('commands.mention.description', { prefix, channel: message.channel.name }))
    .setAuthor(translate('commands.mention.subscriptionOptions'))
    .addOption(translate('commands.mention.optionSubscriberFeed'), translate('commands.mention.optionSubscriberFeedDescription'))
    .addOption(translate('commands.mention.optionFilteredSubscriberFeed'), translate('commands.mention.optionFilteredSubscriberFeedDescription'))
    .addOption(translate('commands.mention.optionRemoveSubscriptions'), translate('commands.mention.optionRemoveSubscriptionsDescription'))
    .addOption(translate('commands.mention.optionListSubscriptions'), translate('commands.mention.optionListSubscriptionsDescription'))

  const data = await new MenuUtils.MenuSeries(message, [selectOption], { command, feeds, profile, translate, locale: guildLocale }).start()
  if (!data) {
    return
  }
  const { optionSelected, role, user } = data
  if (optionSelected === '4') {
    return printSubscriptions(message, feeds, translate)
  }
  if (optionSelected === '3') {
    return deleteSubscription(message, profile, feeds, role, user)
  }
  // 2 and 1 are handled within the Menu functions due to their complexity
}
