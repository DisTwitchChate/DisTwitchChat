const { resolveUser, formatFromNow } = require("../../../utils/functions");
const { MessageEmbed } = require("discord.js");

module.exports = {
	name: "roles",
	aliases: [],
	id: "roles",
	category: "info",
	description: "Get a list of all roles in a server",
	usage: [],
	execute: async (msg, args, bot) => {
		const roles = msg.guild.roles.cache
			.array()
			.filter(role => !role.managed && role.name !== "@everyone")
			.sort((a, b) => b.rawPosition - a.rawPosition);

		const embed = new MessageEmbed()
			.setAuthor(bot.user.username, bot.user.displayAvatarURL())
			.setThumbnail(msg.guild.iconURL())
			.setTitle(`Roles in ${msg.guild.name}`)
			.setDescription(roles.map(role => `${role}\n`).join(""))
			.setColor(roles[0]?.hexColor || "11ee11")
			.setFooter(`Roles: ${roles.length}`)
			.addField("Role Info", "use `roleinfo <pingrole | rolename | roleid>` to get extra information about that role")
			.setTimestamp(new Date());
		msg.channel.send(embed);
	},
};