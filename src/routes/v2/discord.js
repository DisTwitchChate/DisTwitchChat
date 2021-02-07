require("dotenv").config();
import express from "express";
import { validateRequest } from "../../middleware";
import { getProfilePicture } from "../../utils/functions/users";
const router = express.Router();

import sha1 from "sha1";
import fetch from "node-fetch";
import admin from "firebase-admin";
import { getUserInfo } from "../../utils/DiscordClasses";
import { DiscordClient, DiscordOauthClient } from "../../utils/initClients";
import { MessageEmbed } from "discord.js";
import { generateRankCard } from "../../utils/functions";

// get invite link to our discord
router.get("/", (req, res) => {
	res.redirect("https://discord.gg/sFpMKVX");
});

// redirect to the invite page for the bot you can specify a guild if you want
router.get("/invite", (req, res) => {
	const guildId = req.query.guild;
	const inviteURL =
		"https://discord.com/api/oauth2/authorize?client_id=702929032601403482&permissions=8&redirect_uri=https%3A%2F%2Fwww.distwitchchat.com%2F%3Fdiscord%3Dtrue&scope=bot";
	if (guildId) {
		res.redirect(`${inviteURL}&guild_id=${guildId}`);
	} else {
		res.redirect(inviteURL);
	}
});

router.get("/ismember", (req, res, next) => {
	res.json({ result: !!DiscordClient.guilds.resolve(req.query.guild) });
});

router.get("/getchannels", async (req, res, next) => {
	try {
		const id = req.query.guild;
		const selectedGuild = await DiscordClient.guilds.resolve(id);
		const channelManger = selectedGuild.channels;
		const channels = channelManger.cache
			.array()
			.filter(channel => channel.type == "text")
			.map(channel => {
				const parent = channel.parent ? channel.parent.name : "";
				return { id: channel.id, name: channel.name, parent: parent };
			});
		const roleManager = selectedGuild.roles;
		const roles = roleManager.cache.array(); /*.filter(role => !role.managed);*/
		if (req.query.new) {
			res.json({ channels, roles });
		} else {
			res.json(channels);
		}
	} catch (err) {
		console.log(`Error getting channels: ${err}`);

		res.json([]);
	}
});

router.get("/resolvechannel", async (req, res, next) => {
	const { guild, channel } = req.query;
	const response = await fetch("https://api.disstreamchat.com/v2/discord/getchannels?guild=" + guild);
	const json = await response.json();
	res.json(json.filter(ch => ch.id == channel)[0]);
});

router.get("/resolveguild", async (req, res, next) => {
	const {id} = req.query
	const selectedGuild = await DiscordClient.guilds.resolve(id);
	res.json(selectedGuild)
});

router.get("/token/refresh", validateRequest, async (req, res, next) => {
	try {
		const token = req.query.token;
		const tokenData = await DiscordOauthClient.tokenRequest({
			refreshToken: token,
			scope: "identify guilds",
			grantType: "refresh_token",
			clientId: process.env.DISCORD_CLIENT_ID,
			clientSecret: process.env.DISCORD_CLIENT_SECRET,
			redirectUri: process.env.REDIRECT_URI + "/?discord=true",
		});
		res.json({ userData: await getUserInfo(tokenData), tokenData });
	} catch (err) {
		next(err);
	}
});

router.delete("/reactionmessage", validateRequest, async (req, res, next) => {
	try {
		const { channel, message, server } = req.body;
		const guild = await DiscordClient.guilds.cache.get(server);
		const channelObj = guild.channels.resolve(channel);
		const messageToDelete = await channelObj.messages.fetch(message);
		await messageToDelete.delete();
		res.json({ code: 200, message: "success" });
	} catch (err) {
		res.json({ code: 500, message: err.message });
	}
});

router.get("/rankcard", async (req, res, next) => {
	const { user, guild } = req.query;
	const guildObj = DiscordClient.guilds.cache.get(guild);
	const member = await guildObj.members.fetch(user);
	const userData = (await admin.firestore().collection("Leveling").doc(guild).collection("users").doc(user).get()).data();
	const customRankCardData = (await admin.firestore().collection("Streamers").where("discordId", "==", user).get()).docs[0].data();
	const rankcard = await generateRankCard({ ...userData, ...(customRankCardData || {}) }, member);
	res.setHeader("content-type", "image/png");
	res.write(rankcard.toBuffer(), "binary");
	res.end(null, "binary");
});

router.post("/reactionmessage", validateRequest, async (req, res, next) => {
	try {
		const { channel, message, reactions, server } = req.body;
		const guild = await DiscordClient.guilds.cache.get(server);
		const channelObj = guild.channels.resolve(channel);
		const embed = new MessageEmbed().setDescription(message).setColor("#2d688d");
		const sentMessage = await channelObj.send(embed);
		for (const reaction of reactions) {
			try {
				if (reaction.length > 5) {
					reaction = guild.emojis.cache.get(reaction);
				}
				await sentMessage.react(reaction);
			} catch (err) {
				console.log(`error in reacting to message: ${err.message}`);
			}
		}
		res.json({ code: 200, message: "success", messageId: sentMessage.id });
	} catch (err) {
		res.json({ code: 500, message: err.message });
	}
});

router.get("/token", async (req, res, next) => {
	try {
		const redirect_uri = req.query["redirect_uri"] || process.env.REDIRECT_URI;
		console.log(redirect_uri + "/?discord=true");
		const code = req.query.code;
		if (!code) {
			return res.status(401).json({
				status: 401,
				message: "Missing Auth Token",
			});
		}
		const body = {
			code: code,
			scope: "identify guilds",
			grantType: "authorization_code",
			clientId: process.env.DISCORD_CLIENT_ID,
			clientSecret: process.env.DISCORD_CLIENT_SECRET,
			redirectUri: redirect_uri + "/?discord=true",
		};
		const tokenData = await DiscordOauthClient.tokenRequest(body);
		const discordInfo = await getUserInfo(tokenData);
		if (req.query.create) {
			const uid = sha1(discordInfo.id);
			let token = await admin.auth().createCustomToken(uid);
			try {
				await admin.firestore().collection("Streamers").doc(uid).update({
					displayName: discordInfo.name,
					profilePicture: discordInfo.profilePicture,
					name: discordInfo.name.toLowerCase(),
					discordId: discordInfo.id,
				});
			} catch (err) {
				await admin
					.firestore()
					.collection("Streamers")
					.doc(uid)
					.set({
						displayName: discordInfo.name,
						profilePicture: discordInfo.profilePicture,
						name: discordInfo.name.toLowerCase(),
						uid: uid,
						discordId: discordInfo.id,
						ModChannels: [],
						appSettings: {
							TwitchColor: "",
							YoutubeColor: "",
							discordColor: "",
							displayPlatformColors: false,
							displayPlatformIcons: false,
							highlightedMessageColor: "",
							showHeader: true,
							showSourceButton: false,
							compact: false,
							showBorder: false,
							nameColors: true,
						},
						discordLinked: true,
						guildId: [],
						liveChatId: [],
						overlaySettings: {
							TwitchColor: "",
							YoutubeColor: "",
							discordColor: "",
							displayPlatformColors: false,
							displayPlatformIcons: false,
							highlightedMessageColor: "",
							nameColors: true,
							compact: false,
						},
						twitchAuthenticated: false,
						youtubeAuthenticated: false,
					});
			}
			res.json({ ...discordInfo, token });
		} else {
			res.json(discordInfo);
		}
	} catch (err) {
		// res.send
		next(err);
	}
});

router.get("/guildcount", async (req, res, next) => {
	res.json(DiscordClient.guilds.cache.array().length);
});

router.get("/profilepicture", async (req, res, next) => {
	try {
		const user = req.query.user;
		const profilePicture = await getProfilePicture("discord", user);
		res.json(profilePicture);
	} catch (err) {
		next(err);
	}
});

module.exports = router;
