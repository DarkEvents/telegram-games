export default new (class CommonGame {
	public replyMessage = async (ctx: any, messageText: string) => {
		switch (ctx.updateType) {
			case 'callback_query':
				await ctx.answerCbQuery(messageText);
				break;
			case 'message':
				await ctx.replyWithHTML(messageText)
					.then((sub: any) => {
						setTimeout(() => {
							try {
								ctx.deleteMessage(sub.message_id);
							} catch (err) {
								console.log(err);
							}
						}, 15000);
					});
				break;
			case 'inline_query':
				await ctx.answerInlineQuery([], {
					is_personal: true,
					switch_pm_text: messageText,
					switch_pm_parameter: 'error',
				});
				break;
			default:
				await ctx.replyWithHTML(messageText)
					.then((sub: any) => {
						setTimeout(() => {
							ctx.deleteMessage(sub.message_id)
								.catch((err: any)=>console.log(err.message));
						}, 10000);
					});
		}
	}
}
)
