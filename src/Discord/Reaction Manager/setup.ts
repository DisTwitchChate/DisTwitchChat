import admin from "firebase-admin";
import { resolveUser } from "../../utils/functions";

export default async (reaction, user, onJoin=false) => {
	const message = reaction.message;
	const guild = message.guild;
	const guildRef = admin.firestore().collection("reactions").doc(guild.id);
	const guildDB = await guildRef.get();
	const guildData = guildDB.data();
	if (!guildData) {
		try {
			guildRef.update({});
		} catch (err) {
			guildRef.set({});
		}
		return {};
	}
	const reactionRoleMessage = guildData[message.id];
	if (!reactionRoleMessage) return {};
	let action;
	if (onJoin) {
		action = reactionRoleMessage.actions["user-join"];
	} else {
		action = reactionRoleMessage.actions[reaction?.emoji?.id || reaction?.emoji?.name];
		if (!action) action = reactionRoleMessage.actions["catch-all"];
	}
	if (!action) return {};
	let rolesToGiveId = Array.isArray(action.role) ? action.role : [action.role];
	const rolesToGive = await Promise.all(rolesToGiveId.map(roleToGiveId =>  guild.roles.fetch(roleToGiveId)));
	let member = await reaction.message.guild.members.resolve(user);
	if (!member) {
		member = reaction.message.guild.members.cache.get(user.id);
	}
	if (!member) {
		member = await resolveUser(reaction.message, user.id || user.username);
	}
	return { rolesToGive, member, ...action };
};

/*
action = {
    role: role id that is handled by this action,
    type: REMOVE_ON_REMOVE | REMOVE_ON_ADD | ADD_ON_REMOVE | ADD_ON_ADD | TOGGLE: what should we do with the users roles based on what they did with reaction
    DMuser: whether or not to DM the user when they react and have a role change
}
*/
