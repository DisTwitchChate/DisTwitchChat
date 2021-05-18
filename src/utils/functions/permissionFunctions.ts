// @ts-ignore
import adminIds from "../../ranks.json";
import { Channel, Client, GuildMember, Message, Permissions, Role, TextChannel, User } from "discord.js";

export const ArrayAny = (arr1: any[], arr2: any[]): boolean => arr1.some(v => arr2.indexOf(v) >= 0);

export const getHighestRole = (roles: Role[]) => roles.reduce((acc, cur) => (acc.rawPosition > cur.rawPosition ? acc : cur));

export const checkOverwrites = (overwrites, perms, admin?: boolean) => {
	const Allows = new Permissions(overwrites.allow);
	const Deny = new Permissions(overwrites.deny);
	return { allow: Allows.any(perms, admin), deny: !Deny.any(perms, admin) };
};

export const isAdmin = (user: User | { id: string }) => {
	const discordAdmins = adminIds.discord.developers;
	return discordAdmins.includes(user.id);
};

export const adminWare = async (message: Message, args: string[], client: Client, cb) => {
	const discordAdmins = adminIds.discord.developers;
	if (discordAdmins.includes(message.author.id)) {
		await cb(message, args, client);
	} else {
		await message.channel.send("❌ You don't have permission to use this command.");
	}
};

export const hasPermission = async (member: GuildMember, perms: any[], channel?: TextChannel, admin?: boolean) => {
	const guild = member.guild;
	// if(guild.ownerId === member.id) return true
	const hasGlobalPerms = ArrayAny(member.permissions.toArray(), perms);
	let hasPerm = hasGlobalPerms;
	if (channel) {
		const permissionOverwrites = channel?.permissionOverwrites;
		if (!permissionOverwrites) return hasPerm;
		const overWriteRoles = (await Promise.all(permissionOverwrites.keyArray().map(key => guild.roles.fetch(key)))).filter(
			// @ts-ignore
			role => role.name !== "@everyone"
		);
		const memberRoles = member.roles.cache.array();
		//@ts-ignore
		const memberOverWriteRoles = overWriteRoles.filter(role => memberRoles.find(r => role.id === r.id));
		const highestOverWriteRole = getHighestRole(memberOverWriteRoles);
		const roleOverWrites = permissionOverwrites.get(highestOverWriteRole.id);
		const { allow, deny } = checkOverwrites(roleOverWrites, perms, admin);
		return (hasPerm || allow) && hasPerm && deny;
	}
	return hasPerm;
};

export const modWare = async (msg, args, client, permissions, cb, { twitch }: any = {}) => {
	if (await hasPermission(msg.member, permissions)) {
		await cb(msg, args, client);
	} else {
		await msg.channel.send(
			`❌ you don't have permission to use this command, use ${client?.prefix || ""}help to see available commands`
		);
	}
};
