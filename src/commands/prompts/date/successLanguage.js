const { DiscordPrompt, MessageVisual } = require('discord.js-prompts')
const Translator = require('../../../structs/Translator.js')
const getConfig = require('../../../config.js').get

/**
 * @typedef {Object} Data
 * @property {import('../../../structs/db/Profile.js')} [profile]
 * @property {import('../../../structs/db/Feed.js')[]} feeds
 * @property {import('../../../structs/db/Feed.js')} [selectedFeed]
 * @property {string} selected
 * @property {string} setting
 */

/**
 * @param {Data} data
 */
function successLanguageVisual (data) {
  const config = getConfig()
  const { profile, setting } = data
  const translate = Translator.createProfileTranslator(profile)
  if (setting === 'reset') {
    return new MessageVisual(translate('commands.date.successReset', {
      name: translate('commands.date.dateLanguage'),
      value: config.feeds.dateLanguage
    }))
  } else {
    return new MessageVisual(translate('commands.date.successSet', {
      name: translate('commands.date.dateLanguage'),
      value: setting
    }))
  }
}

const prompt = new DiscordPrompt(successLanguageVisual)

exports.prompt = prompt