const Feed = require('../../../structs/db/Feed.js')
const Schedule = require('../../../structs/db/Schedule.js')
const Supporter = require('../../../structs/db/Supporter.js')
const AssignedSchedule = require('../../../structs/db/AssignedSchedule.js')
const Format = require('../../../structs/db/Format.js')

jest.mock('../../../structs/db/Format.js')
jest.mock('../../../structs/db/AssignedSchedule.js')
jest.mock('../../../structs/db/Schedule.js')
jest.mock('../../../structs/db/Supporter.js')

describe('Unit::structs/db/Feed', function () {
  const keys = [
    'checkDates',
    'checkTitles',
    'formatTables',
    'imgLinksExistence',
    'imgPreviews',
    'toggleRoleMentions'
  ]
  const necessaryInit = {
    title: 'e5rh',
    channel: 'e5rhy',
    url: 'swr4y',
    guild: 'wa4eyh'
  }
  afterEach(function () {
    jest.restoreAllMocks()
  })
  describe('constructor', function () {
    it(`throws an error when title is missing`, function () {
      expect(() => new Feed({ channel: 1, url: 1, guild: 1 }))
        .toThrowError(new Error('Undefined title'))
    })
    it(`throws an error when channel is missing`, function () {
      expect(() => new Feed({ title: 1, url: 1, guild: 1 }))
        .toThrowError(new Error('Undefined channel'))
    })
    it(`throws an error when url is missing`, function () {
      expect(() => new Feed({ title: 1, channel: 1, guild: 1 }))
        .toThrowError(new Error('Undefined url'))
    })
    it(`throws an error when guild is missing`, function () {
      expect(() => new Feed({ title: 1, url: 1, channel: 1 }))
        .toThrowError(new Error('Undefined guild'))
    })
    it('sets defined values from arg', function () {
      const init = {
        ...necessaryInit
      }
      let val = 'awsfde'
      for (const key of keys) {
        val += 'r'
        init[key] = val
      }
      init.webhook = {
        id: 'asb',
        avatar: 'adsef',
        name: 'adesgrf'
      }
      const feed = new Feed({ ...init })
      for (const key in init) {
        expect(feed[key]).toEqual(init[key])
      }
    })
  })
  describe('toObject', function () {
    it('returns a plain with the right keys', function () {
      const feed = new Feed({ ...necessaryInit })
      const exported = feed.toObject()
      expect(Object.prototype.toString.call(exported) === '[object Object]').toEqual(true)
      for (const key of keys) {
        expect(exported[key]).toEqual(feed[key])
      }
      for (const key in necessaryInit) {
        expect(exported[key]).toEqual(necessaryInit[key])
      }
    })
  })
  describe('set webhook', function () {
    it('sets correctly', function () {
      const feed = new Feed({ ...necessaryInit })
      const webhook = {
        id: 123,
        name: 'aszdfe',
        avatar: 'ewstrg',
        george: 'costanza'
      }
      feed.webhook = webhook
      expect(feed._webhook).toEqual(webhook)
    })
  })
  describe('set split', function () {
    it('sets correctly', function () {
      const feed = new Feed({ ...necessaryInit })
      const split = {
        id: 123,
        hawa: 'asdf'
      }
      feed.webhook = split
      expect(feed._webhook).toEqual(split)
    })
  })
  describe('getFormat', function () {
    it('calls Feed.getBy correctly', async function () {
      const _id = 'w4ytghre5ue35hu'
      const feed = new Feed({ ...necessaryInit })
      feed._id = _id
      await feed.getFormat()
      expect(Format.getBy).toHaveBeenCalledWith('feed', _id)
    })
  })
  describe('enable', function () {
    it('calls this.save', async function () {
      const feed = new Feed({ ...necessaryInit })
      feed.disabled = 'hura'
      const spy = jest.spyOn(feed, 'save').mockResolvedValue()
      await feed.enable()
      expect(spy).toHaveBeenCalled()
    })
    it('sets this.disabled to undefined', async function () {
      const feed = new Feed({ ...necessaryInit })
      feed.disabled = 'hoopa dooop'
      jest.spyOn(feed, 'save').mockResolvedValue()
      await feed.enable()
      expect(feed.disabled).toEqual(undefined)
    })
  })
  describe('disable', function () {
    it('calls this.save', async function () {
      const feed = new Feed({ ...necessaryInit })
      const spy = jest.spyOn(feed, 'save').mockResolvedValue()
      await feed.disable()
      expect(spy).toHaveBeenCalled()
    })
    it('sets this.disabled to the reason given', async function () {
      const feed = new Feed({ ...necessaryInit })
      jest.spyOn(feed, 'save').mockResolvedValue()
      const reason = 'hoopa doop'
      await feed.disable(reason)
      expect(feed.disabled).toEqual(reason)
    })
    it('sets this.disabled to the default reason if none given', async function () {
      const feed = new Feed({ ...necessaryInit })
      jest.spyOn(feed, 'save').mockResolvedValue()
      await feed.disable()
      expect(feed.disabled).toEqual('No reason specified')
    })
  })
  describe('determineSchedule', function () {
    const schedules = [{
      name: 'sched1',
      feeds: ['aa', 'bb', 'cc'],
      keywords: ['key1', 'key2']
    }, {
      name: 'sched2',
      feeds: ['id1', 'id2', 'id3'],
      keywords: ['yek1', 'yek2']
    }]
    beforeEach(function () {
      Schedule.getAll.mockResolvedValue([])
      Supporter.getValidGuilds.mockResolvedValue([])
    })
    afterEach(function () {
      Schedule.getAll.mockReset()
      Supporter.getValidGuilds.mockReset()
    })
    it('calls Schedule.getAll if it is not passed in', async function () {
      const feed = new Feed({ ...necessaryInit })
      await feed.determineSchedule()
      expect(Schedule.getAll).toHaveBeenCalledTimes(1)
    })
    it('calls Supporter.getValidGuilds if it is not passed in', async function () {
      const feed = new Feed({ ...necessaryInit })
      await feed.determineSchedule()
      expect(Supporter.getValidGuilds).toHaveBeenCalledTimes(1)
    })
    it('does not call Supporter methods if both passed in', async function () {
      const feed = new Feed({ ...necessaryInit })
      await feed.determineSchedule(undefined, [])
      expect(Supporter.getValidGuilds).not.toHaveBeenCalled()
    })
    it('does not call Schedule methods if both passed in', async function () {
      const feed = new Feed({ ...necessaryInit })
      await feed.determineSchedule(undefined, undefined, [])
      expect(Schedule.getAll).not.toHaveBeenCalled()
    })
    it(`returns the schedule that has the feed's id`, async function () {
      const feed = new Feed({ ...necessaryInit })
      feed._id = 'id1'
      feed.url = 'no match'
      const name = await feed.determineSchedule(-1, [], schedules)
      expect(name).toEqual(schedules[1].name)
    })
    it(`returns the schedule if it has a keyword in the feed's url`, async function () {
      const feed = new Feed({ ...necessaryInit })
      feed._id = 'no match'
      feed.url = 'dun yek2 haz'
      const name = await feed.determineSchedule(-1, [], schedules)
      expect(name).toEqual(schedules[1].name)
    })
    it(`returns the default schedule if it matches no schedules`, async function () {
      const feed = new Feed({ ...necessaryInit })
      feed._id = 'no match'
      feed.url = 'no match'
      const name = await feed.determineSchedule(-1, [], schedules)
      expect(name).toEqual('default')
    })
    it('returns undefined if schedule is already assigned', async function () {
      const feed = new Feed({ ...necessaryInit })
      feed._id = 'no match'
      feed.url = 'dun yek2 haz'
      AssignedSchedule.getByFeedAndShard.mockResolvedValue({
        something: 'wog'
      })
      const name = await feed.determineSchedule(-1, [], schedules)
      expect(name).toEqual(undefined)
      AssignedSchedule.getByFeedAndShard.mockRestore()
    })
    describe('if supporter enabled', function () {
      beforeEach(function () {
        Supporter.enabled = true
      })
      afterEach(function () {
        Supporter.enabled = false
      })
      it(`returns the supporter schedule if it is not feed43`, async function () {
        const guild = 'w234tyg5er'
        const scheduleName = 'foobzz'
        Supporter.schedule = {
          name: scheduleName
        }
        const feed = new Feed({ ...necessaryInit })
        feed._id = 'no match'
        feed.url = 'no match'
        feed.guild = guild
        const supporterGuilds = ['a', 'b', guild, 'd']
        const name = await feed.determineSchedule(-1, supporterGuilds, schedules)
        expect(name).toEqual(scheduleName)
        Supporter.schedule = undefined
      })
      it(`does not return supporter schedule if feed43`, async function () {
        const guild = 'w234hjnvbmr'
        const scheduleName = 'foobzz'
        Supporter.schedule = {
          name: scheduleName
        }
        const feed = new Feed({ ...necessaryInit })
        feed._id = 'no match'
        feed.url = 'https://feed43.com'
        feed.guild = guild
        const supporterGuilds = ['a', 'b', guild, 'd']
        const name = await feed.determineSchedule(-1, supporterGuilds, schedules)
        expect(name).not.toEqual(scheduleName)
        Supporter.schedule = undefined
      })
    })
  })
  describe('assignSchedule', function () {
    it('calls determineSchedule properly', async function () {
      const feed = new Feed({ ...necessaryInit })
      const spy = jest.spyOn(feed, 'determineSchedule').mockReturnValue()
      await feed.assignSchedule(1, 2, 3)
      expect(spy).toHaveBeenCalledWith(1, 2, 3)
      spy.mockRestore()
    })
    it('creates and saves a new assigned schedule with the right values', async function () {
      const feed = new Feed({ ...necessaryInit })
      feed._id = 'some id'
      feed.url = 'some url'
      feed.guild = 'some guild'
      const scheduleName = 'w3e4t6yre5tu'
      const spy = jest.spyOn(feed, 'determineSchedule')
        .mockReturnValue(scheduleName)
      await feed.assignSchedule(100)
      expect(AssignedSchedule).toHaveBeenCalledWith({
        feed: 'some id',
        schedule: scheduleName,
        url: 'some url',
        guild: 'some guild',
        shard: 100
      })
      expect(AssignedSchedule.mock.instances[0].save)
        .toHaveBeenCalledTimes(1)
      spy.mockRestore()
    })
  })
  describe('removeSchedule', function () {
    it('calls delete on the found assigned schedule', async function () {
      const feed = new Feed({ ...necessaryInit })
      const deleteFn = jest.fn()
      AssignedSchedule.getByFeedAndShard.mockResolvedValue({
        delete: deleteFn
      })
      await feed.removeSchedule()
      expect(deleteFn).toHaveBeenCalledTimes(1)
    })
    it(`does not reject when no assigned schedule is found`, async function () {
      const feed = new Feed({ ...necessaryInit })
      AssignedSchedule.getByFeedAndShard.mockResolvedValue(null)
      await expect(feed.removeSchedule())
        .resolves.toEqual(undefined)
    })
  })
  describe('reassignSchedule', function () {
    it('calls the right functions', async function () {
      const feed = new Feed({ ...necessaryInit })
      const spy = jest.spyOn(feed, 'removeSchedule').mockResolvedValue()
      const spy2 = jest.spyOn(feed, 'assignSchedule').mockResolvedValue()
      const shardID = 325
      await feed.reassignSchedule(shardID)
      expect(spy).toHaveBeenCalledWith(shardID)
      expect(spy2).toHaveBeenCalledWith(shardID)
    })
    it('returns the result of assignSchedule', async function () {
      const feed = new Feed({ ...necessaryInit })
      const assignedSchedule = 'heazzz'
      jest.spyOn(feed, 'removeSchedule').mockResolvedValue()
      jest.spyOn(feed, 'assignSchedule').mockResolvedValue(assignedSchedule)
      const result = await feed.reassignSchedule()
      expect(result).toEqual(assignedSchedule)
    })
  })
})