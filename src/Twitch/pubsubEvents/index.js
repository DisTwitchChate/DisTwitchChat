require("dotenv").config();
const path = require("path");
const fs = require("fs");
import { walkSync } from "../../utils/functions";
const commandPath = __dirname;
const commandFiles = [...walkSync(fs.readdirSync(commandPath), commandPath)].filter(file => file.name !== "index.js");
const admin = require("firebase-admin");
const TPS = require("twitchps");
import {TwitchApiClient as Api} from "../../utils/initClients"
import { refreshTwitchToken } from "../../utils/functions/auth";
import {customBots} from "../../utils/initClients"

const commands = commandFiles.reduce(
	(acc, cur) => ({
		...acc,
		[cur.name.replace(".js", "")]: { ...cur, exec: require(cur.path) },
	}),
	{}
);

export default async (io) => {
	let pubsubbedChannels = [];

	const bots = await customBots

	admin
		.firestore()
		.collection("live-notify")
		.onSnapshot(async snapshot => {
			const allNotifyingChannels = [
				...new Set(
					(await Promise.all(snapshot.docs.map(async doc => await doc.data().channels))).reduce((acc, cur) => [...acc, ...cur])
				),
			].filter(channel => !pubsubbedChannels.find(subChannel => subChannel.id === channel));

			console.log(allNotifyingChannels.length)

			for (const channel of allNotifyingChannels) {
				const streamerData = await Api.getUserInfo(channel);

				const init_topics = [
					{
						topic: `video-playback.${streamerData.login}`,
					},
				];

				const pubSub = new TPS({
					init_topics,
					reconnect: false,
					debug: false,
				});

				pubSub.channelName = streamerData.login;

				pubsubbedChannels.push({ listener: pubSub, id: channel });

				pubSub.on("stream-up", data => commands["stream-up"].exec({...data, id: channel, ...streamerData}, streamerData.login, io, bots));
			}
		});

	admin
		.firestore()
		.collection("Streamers")
		.onSnapshot(async allStreamersRef => {
			const trulyAdded = allStreamersRef
				.docChanges()
				.filter(change => change.type !== "modified")
				.map(change => change.doc);

			if (!trulyAdded.length) return;

			const allStreamersTwitchData = (
				await Promise.all(trulyAdded.map(async doc => await doc.ref.collection("twitch").doc("data").get()))
			).map(doc => doc.data());

			const authorizedStreamers = allStreamersTwitchData
				.filter(s => s)
				.filter(streamer => !pubsubbedChannels.find(subChannel => subChannel.id === streamer.user_id && subChannel.isUser));

			console.log("Authorized Streamers: ", authorizedStreamers.length);

			authorizedStreamers.forEach(async streamer => {
				if (!streamer.user_id) return;

				const streamerData = await Api.getUserInfo(streamer.user_id);

				const { access_token, scope } = await refreshTwitchToken(streamer.refresh_token);

				if (!scope?.includes?.("channel:moderate")) return;

				const init_topics = [
					{
						topic: `channel-points-channel-v1.${streamer.user_id}`,
						token: access_token,
					},
					{
						topic: `chat_moderator_actions.${streamer.user_id}`,
						token: access_token,
					},
				];

				const pubSub = new TPS({
					init_topics,
					reconnect: false,
					debug: false,
				});

				pubSub.channelName = streamerData.login;

				pubsubbedChannels.push({ listener: pubSub, id: streamer.user_id, isUser: true });

				pubSub.on("channel-points", async data => {
					try {
						const { redemption, channel_id } = data;
						const user = await Api.getUserInfo(channel_id);
						const channelName = user.login;
						let message = `${redemption.user.display_name || redemption.user.login} has redeemed: ${redemption.reward.title} `;
						if (redemption.reward.prompt.length > 0) {
							message = `${message} - ${redemption.reward.prompt}`;
						}
						const id = uuidv1();

						const messageObject = {
							displayName: "DisStreamChat",
							avatar: DisStreamChatProfile,
							body: message,
							platform: "twitch",
							messageId: "subscription",
							messageType: "channel-points",
							uuid: id,
							id,
							badges: {},
							sentAt: new Date().getTime(),
							userColor: "#ff0029",
						};

						io.in(`twitch-${channelName}`).emit("chatmessage", messageObject);
					} catch (error) {
						console.log("error sending redemption message", data, error.message);
					}
				});

				pubSub.on("automod_rejected", async data => {
					try {
						const { channelName } = pubSub;
						const theMessage = await formatMessage(data.message, "twitch", {}, { HTMLClean: true });
						const id = uuidv1();
						const messageObject = {
							displayName: "AutoMod",
							avatar: DisStreamChatProfile,
							body: theMessage,
							platform: "twitch",
							messageId: "",
							messageType: "auto-mod-reject",
							uuid: id,
							id,
							badges: {},
							sentAt: new Date().getTime(),
							userColor: "#ff0029",
							...data,
						};
						io.in(`twitch-${channelName}`).emit("auto-mod", messageObject);
					} catch (error) {
						console.log("error sending automod message", data, error.message);
					}
				});

				pubSub.on("approved_automod_message", data => {
					const { channelName } = pubSub;
					io.in(`twitch-${channelName}`).emit("remove-auto-mod", data);
					// console.log("Mod", data.created_by);
					// console.log("Mod ID", data.created_by_user_id);
					// console.log("Approved MessageID", data.message_id);
					// console.log("TargetUser", data.target_user_login);
					// console.log("TargetUserID", data.target_user_id);
				});

				pubSub.on("denied_automod_message", data => {
					const { channelName } = pubSub;
					io.in(`twitch-${channelName}`).emit("remove-auto-mod", data);
					// console.log("Mod", data.created_by);
					// console.log("Mod ID", data.created_by_user_id);
					// console.log("Denied MessageID", data.message_id);
					// console.log("TargetUser", data.target_user_login);
					// console.log("TargetUserID", data.target_user_id);
				});

				pubSub.on("add_blocked_term", data => {
					console.log("Mod", data.created_by);
					console.log("ModID", data.created_by_user_id);
					console.log("Added Blocked Term", data.approved_term);
				});

				pubSub.on("delete_blocked_term", data => {
					console.log("Mod", data.created_by);
					console.log("ModID", data.created_by_user_id);
					console.log("Deleted Blocked Term", data.blocked_term);
				});

				pubSub.on("add_permitted_term", data => {
					console.log("Mod", data.created_by);
					console.log("ModID", data.created_by_user_id);
					console.log("Added Permitted Term", data.approved_term);
				});

				pubSub.on("delete_permitted_term", data => {
					console.log("Mod", data.created_by);
					console.log("ModID", data.created_by_user_id);
					console.log("Deleted Permitted Term", data.blocked_term);
				});
			});
		});
};