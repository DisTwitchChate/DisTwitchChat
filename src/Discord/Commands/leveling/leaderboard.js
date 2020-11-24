const { resolveUser, generateRankCard } = require("../../../utils/functions");
const { MessageAttachment } = require("discord.js");
const path = require("path");
const fs = require("fs");
// the admin app has already been initialized in routes/index.js

module.exports = {
	name: "leaderboard",
	aliases: [],
	plugin: "leveling",
	id: "leaderboard",
	category: "leveling",
	description: "Get the link to the leaderboard for this guild.",
	usage: ["leaderboard"],
	execute: async (message, args, client) => {
		message.channel.send(`https://www.disstreamchat.com/leaderboard/${message.guild.id}`)
	},
};
