import { createReadStream } from 'fs';
import { Message } from 'typegram'
import { ChatMember, InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram';
import { Context, Markup } from 'telegraf';
import { poolData } from '../database';
import { RowDataPacket } from 'mysql2';
import { GameData } from '../GameData';
import CommonGame from '../CommonGame';
import PoolConnection = require('mysql2/typings/mysql/lib/PoolConnection');

export default new (class TicTacToeGame {
	private checkVictory = (board: number[][]): boolean => {
		if (!board || board.length !== 3 || !board[0] || !board[1] || !board[2]) return false;

		const lines = [
			// Righe
			...board,
			// Colonne
			[board[0][0], board[1][0], board[2][0]],
			[board[0][1], board[1][1], board[2][1]],
			[board[0][2], board[1][2], board[2][2]],
			// Diagonali
			[board[0][0], board[1][1], board[2][2]],
			[board[0][2], board[1][1], board[2][0]],
		];

		return lines.some(
			([a, b, c]) => a !== -1 && a === b && b === c
		);
	};


	private checkNoMove = (board: any): boolean => {
		const stretched: Array<number> = board.reduce((acc: Array<number>, curVal: number) => acc.concat(curVal), []);
		return !stretched.includes(-1);
	}

	public async handlePlayerTurn(ctx: any, promisePool: PoolConnection,col: number, row: number, _gameName: string) {
		const message = ctx.callbackQuery.message?.message_id;
		//@ts-ignore
		const [rows] = await promisePool.query<RowDataPacket[]>(
			'SELECT `message`, `challenger`, `challenged`, `round`, JSON_EXTRACT(board, "$") as board FROM `tictactoe` WHERE telegram_chat_id_fk = ? AND message = ?',
			[ctx.chat?.id, ctx.callbackQuery.message?.message_id]
		);

		if (rows.length === 0) {
			return;
		}

		const result = rows[0];
		if (!result) {
			return;
		}

		const gameData: GameData = {
			board: JSON.parse(result.board as string),
			challenged: result.challenged as number,
			challenger: result.challenger as number,
			message: result.message as number,
			round: result.round as number,
		};
		const { board, challenged, challenger, round } = gameData;
		// gameover
		if(round === -1) {
			return
		}
		const player = round === 0 ? challenger : challenged;

		const marker: number = gameData.round
		if (gameData.round !== 0 && gameData.round !== 1) {
			CommonGame.replyMessage(ctx, 'Non puoi giocare questa partita.');
			return
		}

		if (player !== ctx.from?.id) {
			CommonGame.replyMessage(ctx, "Non è il tuo turno");
			return;
		}

		if (row && col) {
			//@ts-ignore
			board[+row - 1][+col - 1] = marker;

			const rMarkup: InlineKeyboardMarkup | undefined = (ctx.update.callback_query.message as Message.TextMessage).reply_markup;
			if (!rMarkup) {
				return;
			}

			const keyboard = rMarkup.inline_keyboard;
			if (!keyboard) {
				return;
			}

			const kRow = keyboard[+col - 1];
			if (!kRow) {
				return;
			}

			const kCol = kRow[+row - 1];
			if (kCol) {
				kCol.text = marker === 0 ? '⭕️' : '❌';
			}
			let challenge = 'challenger'
			if(marker === 0 ){
				challenge = 'challenged'
			}
			//@ts-ignore
			const [opponent] = await promisePool.query(`SELECT * FROM tictactoe join user ON tictactoe.${challenge} = user.telegram_user_id WHERE telegram_chat_id_fk = ? and tictactoe.message = ?`, [ctx.chat?.id, message]);
			const msg = ctx.callbackQuery.message?.caption?.split(/\r?\n/);
			if (msg) {
				//@ts-ignore
				msg[1] = (marker === 0 ? '❌' : '⭕️') + opponent[0].first_name + " è il tuo turno";
				await ctx.editMessageCaption(msg.join("\r\n"), {
					reply_markup: rMarkup
				});
			}

			await promisePool.query("UPDATE `tictactoe` SET round = ?, board=?  WHERE telegram_chat_id_fk = ? and message = ?", [1 - round, JSON.stringify(board), ctx.chat?.id, message]);

			if (this.checkVictory(board)) {
				await promisePool.query(`INSERT INTO score (game_id_fk, score, telegram_chat_id_fk, telegram_user_id_fk) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE score = score + ?`, [1, 1, ctx.chat?.id, ctx.from?.id, 1]);
				await promisePool.query("UPDATE `tictactoe` SET round = -1  WHERE telegram_chat_id_fk = ? and message = ?", [ctx.chat?.id, message]);
				ctx.editMessageMedia({
					type: "photo",
					media: { source: createReadStream('./assets/wchallenger.jpg') },
					caption: ctx.from?.first_name + " ha vinto.",
					parse_mode: 'HTML',
					has_spoiler: true
				}, {
					reply_markup: rMarkup
				}).then((sub: any) => {
					setTimeout(() => {
						ctx.deleteMessage(sub.message_id).
						catch((err: any) => console.log(err));
					}, 300000);
				});
				return;
			}

			if (this.checkNoMove(board)) {
				await promisePool.query("UPDATE `tictactoe` SET round = -1  WHERE telegram_chat_id_fk = ? and message = ?", [ctx.chat?.id, message]);
				ctx.editMessageMedia({
					type: "photo",
					media: { source: createReadStream('./assets/pareggio.jpg') },
					caption: "Pareggio.",
					parse_mode: 'HTML',
					has_spoiler: true
				}).then((sub: any) => {
					setTimeout(() => {
						ctx.deleteMessage(sub.message_id)
							.catch((err: any) => console.log(err))
					}, 300000);
				});
			}
		}
	}

	public executeSfidaCommand = async (ctx: Context, user: ChatMember, gameName: string) => {
		const promisePool = poolData.promise();

		try {
			await promisePool.query('START TRANSACTION');

			await promisePool.query(`INSERT INTO user (telegram_user_id, first_name, username)
							   VALUES (?, ?, ?)
							   ON DUPLICATE KEY UPDATE first_name = ?, username = ?`,
				[ctx.from?.id, ctx.from?.first_name, ctx.from?.username, ctx.from?.first_name, ctx.from?.username]);

			await promisePool.query(`INSERT INTO user (telegram_user_id, first_name, username)
							   VALUES (?, ?, ?)
							   ON DUPLICATE KEY UPDATE first_name = ?, username = ?`,
				[user.user.id, user.user.first_name, user.user.username, user.user.first_name, user.user.username]);

			// await promisePool.query("INSERT INTO `tictactoe` (telegram_chat_id_fk, `message`, `challenger`, `challenged`, `round`, `board`) VALUES (?, ?, ?, ?, ?, ?)",
			// 	[ctx.chat?.id, ctx.message?.message_id, ctx.from?.id, user.user.id, 1, '[[-1,-1,-1],[-1,-1,-1],[-1,-1,-1]]']);

			await promisePool.query('COMMIT');

			console.log("All queries have been executed successfully!");
		} catch (error) {
			console.error("An error occurred while executing the queries:", error);
			console.log("Performing rollback for the previously executed queries...");

			await promisePool.query('ROLLBACK');

			console.log("Rollback completed successfully!");
		}

		const keyboardLink = Markup.inlineKeyboard([
			[Markup.button.callback("⬜️", `tick-1-1-${gameName}`), Markup.button.callback("⬜️", `tick-1-2-${gameName}`), Markup.button.callback("⬜️", `tick-1-3-${gameName}`)],
			[Markup.button.callback("⬜️", `tick-2-1-${gameName}`), Markup.button.callback("⬜️", `tick-2-2-${gameName}`), Markup.button.callback("⬜️", `tick-2-3-${gameName}`)],
			[Markup.button.callback("⬜️", `tick-3-1-${gameName}`), Markup.button.callback("⬜️", `tick-3-2-${gameName}`), Markup.button.callback("⬜️", `tick-3-3-${gameName}`)]
		]);

		let turn = user.user.first_name;

		ctx.replyWithPhoto({ source: createReadStream('./assets/sfida.jpg') }, {
			caption: `${ctx.from?.first_name} ha lanciato la sfida a ${user.user.first_name} (@${user.user.username ? user.user.username : '?'})` + "\r\n" + `❌ ${turn} è il tuo turno`,
			parse_mode: 'HTML',
			reply_markup: keyboardLink.reply_markup
		})
			.then(async (msg) => await promisePool.query("INSERT INTO `tictactoe` (telegram_chat_id_fk, `message`, `challenger`, `challenged`, `round`, `board`) VALUES (?, ?, ?, ?, ?, ?)",
				[ctx.chat?.id, msg.message_id, ctx.from?.id, user.user.id, 1, '[[-1,-1,-1],[-1,-1,-1],[-1,-1,-1]]']));
	}

	public getClassifica = async (chatId: number) => {
		const promisePool = poolData.promise();
		interface ClassificaRow extends RowDataPacket {
			telegram_user_id: number;
			score: number;
			first_name: string;
			myrank: number;
		}

		const [rows] = await promisePool.query<ClassificaRow[]>(
			`SELECT u.telegram_user_id, s.score, first_name,
		(DENSE_RANK() OVER (
		  ORDER BY s.score DESC
		)) AS myrank
		FROM score s
		JOIN chat c ON s.telegram_chat_id_fk = c.telegram_chat_id
		JOIN user u ON s.telegram_user_id_fk = u.telegram_user_id
		WHERE c.telegram_chat_id = ?
		  AND s.game_id_fk = 1
		ORDER BY s.score DESC
		LIMIT 10`, [chatId]
		);

		let flatRank = ['', '', '', '', '', '', '', '', '', ''];
		let arrayRank = [[], [], [], [], [], [], [], [], [], []];
		for (const el of rows) {
			if (el.myrank == 11) {
				break;
			}
			//@ts-ignore
			arrayRank[el.myrank - 1].push(el.first_name);
			//@ts-ignore
			flatRank[el.myrank - 1] = arrayRank[el.myrank - 1].length !== 0 ? arrayRank[el.myrank - 1].join(",") + ` Punti: (${el.score})` : 'nessuno';
		}
		const rankLabels = ['🥇', '🥈', '🥉', '4', '5', '6', '7', '8', '9', '10'];
		const classificaText = rankLabels
			.map((label, index) => {
				const rank = flatRank[index];
				return rank ? `${label} -> ${rank}` : undefined;
			})
			.join('\r\n');
		return classificaText;
	}
})
