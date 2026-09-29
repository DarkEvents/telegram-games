import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { Context, Middleware, Telegraf } from 'telegraf';
import { poolData } from './database';

// import tictacToe from './tictactoe/TicTacToeGame';
import { createInstance, classMap, validClassNames, ValidClassName } from './GameData';
import CommonGame from './CommonGame';

const WELCOME_MESSAGE = 'Grazie, e buon divertimento.\nDigita /help per leggere le istruzioni.\nLa documentazione potrebbe non essere allineata.';

const token =

	(existsSync(path.join(__dirname, 'bot-token.txt')) && readFileSync(path.join(__dirname, 'bot-token.txt'), 'utf8').trim()) ||
	process.env.BOT_TOKEN;
if (!token) {
	throw new Error(
		'You have to provide the bot-token from @BotFather via file (bot-token.txt) or environment variable (BOT_TOKEN)'
	);
}
const bot = new Telegraf(token);

// Definisci il tempo di ritardo tra l'esecuzione di ogni azione in millisecondi
// const actionDelay = 2000;

// Coda di azioni
const actionQueue: string[] = [];
let isProcessingActions = false; // Flag per indicare se le azioni sono in corso di elaborazione


// Registra un middleware per gestire le azioni
const actionHandler: Middleware<Context> = async (ctx, next) => {
	//@ts-ignore
  const action = ctx.callbackQuery?.data;

  if (action) {
    // Aggiungi l'azione alla coda
    actionQueue.push(action);

    // Avvia l'elaborazione delle azioni se non è già in corso
    if (!isProcessingActions) {
		console.log('processing');
      processActions(ctx);
    }
  }

  try {
    await next(); // Esegue le azioni successive nel middleware
  } catch (error) {
    if (error instanceof Error && error.message.includes('429')) {
      const retryAfter = 5; // Tempo di ritardo predefinito
      console.log(`Too Many Requests: Retry after ${retryAfter} seconds.`);
      CommonGame.replyMessage(ctx, 'Too Many Requests: Retry after delay.');
      await sleep(retryAfter * 1000); // Attendi il tempo di ritardo prima di ritentare l'azione
    } else {
      throw error; // Lancia l'errore se non è un errore di "Too Many Requests"
    }
  }
};

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
  }

// Aggiungi il middleware all'istanza di Telegraf
bot.use(actionHandler);

// Funzione per elaborare le azioni nella coda
async function processActions(ctx: Context) {
	// Imposta il flag di elaborazione delle azioni su true
	isProcessingActions = true;

	while (actionQueue.length > 0) {
	  const action = actionQueue.shift(); // Prendi la prossima azione dalla coda

	  if(action){
		// Gestisci l'azione utilizzando il contesto
		await handleAction(ctx, action);
	  }
	  // Attendi il tempo di ritardo prima di elaborare la prossima azione
	//   await wait(actionDelay);
	}

	// Resetta il flag di elaborazione delle azioni a false
	isProcessingActions = false;
	console.log(isProcessingActions);
  }

  // Funzione per gestire un'azione
  async function handleAction(ctx: Context, action: string) {
	const [_command, col, row, gameName] = action.split('-');
	if(gameName  && validClassNames.includes(gameName as ValidClassName)){
		const game = createInstance(gameName as keyof typeof classMap);
		const promisePool = poolData.promise();
		await promisePool.query('START TRANSACTION');
		try {
			await game.handlePlayerTurn(ctx, promisePool, Number(col), Number(row), gameName)
			await promisePool.query('COMMIT')

		} catch (err:any) {
			await promisePool.query('ROLLBACK');
			console.log(err.message)

		}
	}
	// Esegui l'elaborazione dell'azione...
	console.log('Handling action:', action);
  }

bot.command('sfida', async (ctx) => {
	if(ctx.message.text.split(' ')[1]) {
		const gameName = ctx.message.text.split(' ')[1];
		if(gameName  && validClassNames.includes(gameName as ValidClassName)){
			const game = createInstance(gameName as keyof typeof classMap);
			let defender: number = 0;

			if (ctx.message.reply_to_message?.from?.id) {
				defender = ctx.message.reply_to_message?.from?.id;

				if (defender === ctx.from.id) {
					CommonGame.replyMessage(ctx, 'Non puoi sfidare te stesso');
					return;
				}
			} else {
				CommonGame.replyMessage(ctx, 'Rispondi ad un messaggio di un utente con /sfida ');
				return;
			}

			const user = await ctx.getChatMember(defender);
			await game.executeSfidaCommand(ctx, user, gameName);
		} else {
			CommonGame.replyMessage(ctx, "gioco non disponibile: \nAl momento puoi giocare a "+validClassNames.join(','))
		}
	} else {
		CommonGame.replyMessage(ctx, "rispondi ad un messagio di un utente con: /sfida tris");
	}
});

bot.command('ttclassifica', async ctx => {
	const game = createInstance('tris');
	const chatId = ctx.chat?.id;
	if (!chatId) {
		return;
	}

	try {
		const classifica = await game.getClassifica(chatId);

		ctx.replyWithHTML(classifica)
		.then((sub) => {
			setTimeout(() => {
				try {
					ctx.deleteMessage(sub.message_id);
				} catch (err) {
					console.log(err);
				}
			}, 300000);
		});
	} catch (error) {
		console.error("Errore durante il recupero della classifica:", error);
		ctx.reply('Si è verificato un errore durante il recupero della classifica.');
	}
});

bot.command('otclassifica', async ctx => {
	const game = createInstance('othello');
	const chatId = ctx.chat?.id;
	if (!chatId) {
		return;
	}

	try {
		const classifica = await game.getClassifica(chatId);

		ctx.replyWithHTML(classifica)
		.then((sub) => {
			setTimeout(() => {
				try {
					ctx.deleteMessage(sub.message_id);
				} catch (err) {
					console.log(err);
				}
			}, 300000);
		});
	} catch (error) {
		console.error("Errore durante il recupero della classifica:", error);
		ctx.reply('Si è verificato un errore durante il recupero della classifica.');
	}
});

bot.start((ctx) => {
	console.log(ctx.chat.type)
	if (ctx.chat.type == 'private') {
		ctx.reply(WELCOME_MESSAGE);
		return;
	}
	// if (!(ctx.chat && ctx.from)) {
	// 	return;
	// }
	if (!ctx.from.username) {
		CommonGame.replyMessage(ctx, 'Devi settare un username.');
		return;
	}
	poolData.getConnection(function (_err: any, conn: any) {
		conn.beginTransaction(function () {
			conn.query(`  INSERT
							INTO user
								(telegram_user_id, first_name, username)
						VALUES (?, ?, ? )
				ON DUPLICATE KEY
						UPDATE first_name = ?,
								username = ?`, [ctx.from.id, ctx.from.first_name, ctx.from.username, ctx.from.first_name, ctx.from.username],
				async (err: any, _result: any) => {
					if (err) {
						CommonGame.replyMessage(ctx, 'Bot già inizializzato');
					} else {
						//@ts-ignore
						let chatName = ctx.chat.title
						if (ctx.chat.type == 'private') {
							chatName = ctx.me
						}
						let chat_link: string | undefined = ''
						if ('username' in ctx.chat) {
							chat_link = ctx.chat.username;
						} else {
							const val = await ctx.telegram.exportChatInviteLink(ctx.chat.id)
							chat_link = val;
						}
						conn.query(`INSERT
									INTO chat (telegram_chat_id, telegram_owner_id_fk, chat_link, name, type)
								VALUES (?, ?, ?, ?, ?)`, [ctx.chat.id, ctx.from.id, chat_link, chatName, ctx.chat.type], (err: any, _results: any, _fields: any) => {
							if (err) {
								CommonGame.replyMessage(ctx, 'Bot già inizializzato');
							} else {
								conn.release();
								conn.commit();
								CommonGame.replyMessage(ctx, 'Bot inizializzato');
							}
						})
					}
				});
		});
	})
});


bot.catch((error: any) => {
	console.error('telegraf error occured', error.message);
});
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));


export async function start(): Promise<void> {
	// The commands you set here will be shown as /commands like /start or /magic in your telegram client.
	await bot.telegram.setMyCommands([
		{ command: 'start', description: 'Avvia il bot.' },
		{ command: 'sfida', description: 'Rispondi ad un messaggio scrivendo /sfida tris.' },
		{ command: 'ttclassifica', description: 'Mostra la classifica tris.' },
		{ command: 'otclassifica', description: 'Mostra la classifica othello.' },
	]);

	await bot.launch();
	//console.log(new Date(), 'Bot started as', bot.botInfo?.username);
}
