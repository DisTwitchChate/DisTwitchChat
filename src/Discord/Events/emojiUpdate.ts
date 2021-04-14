import setupLogging from "./utils/setupLogging";
import { logUpdate } from "./utils";

export default async (oldEmoji, newEmoji, client) => {
    const guild = newEmoji.guild;

    const [channelId, active] = await setupLogging(guild, "emojiUpdate", client)
    if(!active) return

	const embed = await logUpdate(newEmoji, oldEmoji, {
		title: `:pencil: Emoji updated: ${newEmoji}`,
		footer: `Emoji ID: ${oldEmoji.id}`,
		ignoredDifferences: ["_roles"]
	})

    if (!channelId) return;

	const logChannel = guild.channels.resolve(channelId);

	logChannel.send(embed);
};