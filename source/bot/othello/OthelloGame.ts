import { createReadStream } from 'fs';
import { Message } from 'typegram'
import { ChatMember, InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram';
import { Context, Markup } from 'telegraf';
import { poolData } from '../database';
import { RowDataPacket } from 'mysql2';
import { GameData } from '../GameData';
import PoolConnection = require('mysql2/typings/mysql/lib/PoolConnection');

const psB = "▪️";
const psW = "▫️";
const pfW = "⚪️";
const pfB = "⚫️";
export default new (class OthelloGame {
	constructor() { }

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
					});;
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
							try {
								ctx.deleteMessage(sub.message_id);
							} catch (err) {
								console.log(err);
							}
						}, 10000);
					});
		}
	}

	private getValidMoves(board: number[][], playerColor: number): [number, number][] {
		const validMoves: [number, number][] = [];

		const rows = board.length;
		//@ts-ignore
		const cols = board[0].length;
		const directions = [
			[-1, -1], [-1, 0], [-1, 1], // Righe superiori
			[0, -1], /* Posizione corrente */[0, 1], // Stessa riga
			[1, -1], [1, 0], [1, 1] // Righe inferiori
		];

		for (let i = 0; i < rows; i++) {
			for (let j = 0; j < cols; j++) {
				//@ts-ignore
				if (board[i][j] === -1) { // Posizione vuota
					let validMove = false;
					//@ts-ignore
					for (const [dx, dy] of directions) {
						//@ts-ignore
						let x = i + dx;
						//@ts-ignore
						let y = j + dy;
						let foundOpponentPiece = false;

						while (x >= 0 && x < rows && y >= 0 && y < cols) {
							//@ts-ignore
							if (board[x][y] === -1) {
								break; // La posizione è vuota, interrompi il ciclo
								//@ts-ignore
							} else if (board[x][y] === playerColor && foundOpponentPiece) {
								validMove = true; // Trovata una pedina avversaria adiacente
								break;
								//@ts-ignore
							} else if (board[x][y] === 1 - playerColor) {
								foundOpponentPiece = true;
								//@ts-ignore
							} else if (board[x][y] === playerColor) {
								break; // Trovata una pedina dello stesso colore, la mossa non è valida
							}
							//@ts-ignore
							x += dx;
							//@ts-ignore
							y += dy;
						}

						if (validMove) {
							validMoves.push([i, j]);
							break; // Esci dal ciclo delle direzioni
						}
					}
				}
			}
		}

		const uniqueValidMoves = validMoves.filter(
			(value, index, self) => self.findIndex(pos => pos[0] === value[0] && pos[1] === value[1]) === index
		);

		// console.log(uniqueValidMoves);
		return uniqueValidMoves;
	}

	private changeRespectiveTiles = (boardArray: number[][], sym: number, x: number, y: number): [number, number][] => {
		const directions: [number, number][] = [
			[-1, -1], // Top left
			[-1, 0],  // Top
			[-1, 1],  // Top right
			[0, 1],   // Right
			[1, 1],   // Bottom right
			[1, 0],   // Bottom
			[1, -1],  // Bottom left
			[0, -1]   // Left
		];

		const modifiedTiles: [number, number][] = [];

		for (const [dx, dy] of directions) {
			let currentX = x + dx;
			let currentY = y + dy;
			let settle = false;

			//@ts-ignore
			while (currentX >= 0 && currentX < boardArray.length && currentY >= 0 && currentY < boardArray[0].length) {
				//@ts-ignore
				const currentTile = boardArray[currentX][currentY];

				if (currentTile === -1) {
					break;
				} else if (currentTile === sym) {
					settle = true;
					break;
				}

				currentX += dx;
				currentY += dy;
			}

			if (settle) {
				let a = 1;
				let setX = x + a * dx;
				let setY = y + a * dy;
				//@ts-ignore
				while (boardArray[setX][setY] !== sym) {
					//@ts-ignore
					boardArray[setX][setY] = sym;
					modifiedTiles.push([setX, setY]);
					a++;
					setX = x + a * dx;
					setY = y + a * dy;
				}
			}
		}

		return modifiedTiles;
	};

	private updateKeyboardWithValidMoves = (keyboard: any, board: number[][], gameName: string, color: number): [number, number][] => {
		const validMoves = this.getValidMoves(board, color);
		if (validMoves.length !== 0) {
			const updatedKeyboard = keyboard;
			updatedKeyboard.forEach((rows: any) => {
				rows.forEach((col: any) => {
					if (col.text !== pfB && col.text !== pfW) {
						col.text = ' ';
					}
				})
			});

			validMoves.forEach(move => {
				const [col, row] = move;
				//   const buttonIndex = row * 8 + col;
				const newButton = Markup.button.callback(color === 0 ? psB : psW, `tick-${col}-${row}-${gameName}`);
				updatedKeyboard[col][row] = newButton;
			});
		}
		return validMoves;
	}

	private checkVictory = (board: number[][]) => {

		let challenger = 0;
		let challenged = 0;

		board.forEach(row => {
			row.forEach(piece => {
				if (piece === 1) {
					challenger++;
				} else if (piece === 0) {
					challenged++;
				}
			});
		});

		if (challenged > challenger) {
			return 1
		}
		if (challenged < challenger) {
			return -1
		}
		return 0;
	};

	// private checkConsistency(ctx: any, board: number[][]) {
	// 	const rMarkup: InlineKeyboardMarkup | undefined = (ctx.update.callback_query.message as Message.TextMessage).reply_markup;



	// 	for (let indexX = 0; indexX < board.length; indexX++) {
	// 		//@ts-ignore
	// 		const alignedArray = board[indexX].map(number => number.toString().padStart(2, ' '));
	// 		console.debug(indexX, alignedArray.join(',').replace(/-1/g, '  '))
	// 	}
	// 	board.forEach((row, indexX) => row.forEach((_col, indexY)=>{
	// 		//@ts-ignore
	// 		if((rMarkup?.inline_keyboard[indexX][indexY]?.text == ' ' && board[indexX][indexY] === -1)
	// 			//@ts-ignore
	// 			|| (rMarkup?.inline_keyboard[indexX][indexY]?.text == pfB && board[indexX][indexY] === 0)
	// 			//@ts-ignore
	// 			|| (rMarkup?.inline_keyboard[indexX][indexY]?.text == pfW && board[indexX][indexY] === 1)
	// 			//@ts-ignore
	// 			|| (rMarkup?.inline_keyboard[indexX][indexY]?.text == psW && board[indexX][indexY] === -1)
	// 			//@ts-ignore
	// 			|| (rMarkup?.inline_keyboard[indexX][indexY]?.text == psB && board[indexX][indexY] === -1)) {

	// 		} else {
	// 			console.log('Moooooooooooooooooooooooooooooooooooooooooooo')
	// 		}
	// 	}))
	// }
	public async handlePlayerTurn(ctx: any, promisePool: PoolConnection, row: number, col: number, gameName: string) {
		const message = ctx.callbackQuery.message?.message_id;

		// const promisePool = poolData.promise();
		//@ts-ignore
		const [rows] = await promisePool.query<RowDataPacket[]>(
			'SELECT `message`, `challenger`, `challenged`, `round`, JSON_EXTRACT(board, "$") as board FROM `othello` WHERE telegram_chat_id_fk = ? AND message = ?',
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
		const player = round === 1 ? challenger : challenged;

		const marker: number = gameData.round
		if (gameData.round !== 0 && gameData.round !== 1) {
			this.replyMessage(ctx, 'Non puoi giocare questa partita.');
			return
		}

		if (player !== ctx.from?.id) {
			this.replyMessage(ctx, "Non è il tuo turno");
			return;
		}

		if (row >= 0 && col >= 0) {
			const listOfChange = this.changeRespectiveTiles(board, marker, row, col);
			const rMarkup: InlineKeyboardMarkup | undefined = (ctx.update.callback_query.message as Message.TextMessage).reply_markup;
			//@ts-ignore
			if (rMarkup.inline_keyboard[row][col].text !== psB && rMarkup.inline_keyboard[row][col].text !== psW) {
				ctx.answerCbQuery('Posizione non valida')
				return;
			}
			//@ts-ignore
			board[+row][+col] = marker;
			if (!rMarkup) {
				return;
			}

			const keyboard = rMarkup.inline_keyboard;
			if (!keyboard) {
				return;
			}
			listOfChange.forEach(element => {
				//@ts-ignore
				keyboard[element[0]][element[1]].text = marker === 0 ? pfB : pfW;
			});

			const kRow = keyboard[row];
			if (!kRow) {
				return;
			}

			const kCol = kRow[col];
			if (kCol) {
				kCol.text = marker === 0 ? pfB : pfW;
			}
			let challenge = 'challenged'
			if (marker === 0) {
				challenge = 'challenger'
			}
			//@ts-ignore
			const opponent = await promisePool.query(`SELECT * FROM othello join user ON othello.${challenge} = user.telegram_user_id WHERE telegram_chat_id_fk = ? and othello.message = ?`, [ctx.chat?.id, message]);
			const msg = ctx.callbackQuery.message?.caption?.split(/\r?\n/);
			const validMove = this.updateKeyboardWithValidMoves(rMarkup.inline_keyboard, board, gameName, 1 - marker)
			let nextRound = round;
			if (validMove.length !== 0) {
				if (msg) {
					//@ts-ignore
					msg[1] = (marker === 0 ? pfW : pfB) + opponent[0].first_name + "  è il tuo turno";
				}
				nextRound = 1 - round;
			} else {
				const validMove = this.updateKeyboardWithValidMoves(rMarkup.inline_keyboard, board, gameName, marker)
				if (validMove.length === 0) {
					const winner = this.checkVictory(board);
					//@ts-ignore
					const [users] = await promisePool.query(`SELECT o.challenger AS challenger_id, u1.first_name AS challenger, o.challenged AS challenged_id, u2.first_name AS challenged FROM othello o JOIN user u1 ON o.challenger = u1.telegram_user_id JOIN user u2 ON o.challenged = u2.telegram_user_id WHERE o.telegram_chat_id_fk = ? and o.message = ?`, [ctx.chat?.id, message]);
					let winnerImage = 'pareggio'
					let winnerName = ''
					if (winner === 1) {
						//@ts-ignore
						await promisePool.query(`INSERT INTO score
													(game_id_fk, score, telegram_chat_id_fk, telegram_user_id_fk)
											 VALUES (?, ?, ?, ?)
								   ON DUPLICATE KEY
								             UPDATE score = score + ?`, [2, 1, ctx.chat?.id, users[0].challenged_id, 1]);
						winnerImage = "wchallenged";
						//@ts-ignore
						winnerName = users[0].challenged;
					}
					if (winner === -1) {
						//@ts-ignore
						await promisePool.query(`INSERT INTO score
													(game_id_fk, score, telegram_chat_id_fk, telegram_user_id_fk)
											 VALUES (?, ?, ?, ?)
								   ON DUPLICATE KEY
								             UPDATE score = score + ?`, [2, 1, ctx.chat?.id, users[0].challenger_id, 1]);
						winnerImage = "wchallenger";
						//@ts-ignore
						winnerName = users[0].challenger;
					}
					ctx.editMessageMedia({
						type: "photo",
						media: { source: createReadStream(`./assets/${winnerImage}.jpg`) },
						//@ts-ignore
						caption: winnerName + " ha vinto.",
						parse_mode: 'HTML',
						has_spoiler: true
					}, {
						reply_markup: rMarkup
					});
				}
			}
			await promisePool.query("UPDATE `othello` SET round = ?, board=?  WHERE telegram_chat_id_fk = ? and message = ?", [nextRound, JSON.stringify(board), ctx.chat?.id, message]);
			await ctx.editMessageCaption(msg.join("\r\n"), {
				reply_markup: rMarkup
			});

			// this.checkConsistency(ctx, board)
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

			// await promisePool.query("INSERT INTO `othello` (telegram_chat_id_fk, `message`, `challenger`, `challenged`, `round`, `board`) VALUES (?, ?, ?, ?, ?, ?)",
			// 	[ctx.chat?.id, ctx.message?.message_id, ctx.from?.id, user.user.id, 1, '[[-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1, 0, 1,-1,-1,-1],[-1,-1,-1, 1, 0,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1]]']);

			await promisePool.query('COMMIT');

			console.log("All queries have been executed successfully!");
		} catch (error) {
			console.error("An error occurred while executing the queries:", error);
			console.log("Performing rollback for the previously executed queries...");

			await promisePool.query('ROLLBACK');

			console.log("Rollback completed successfully!");
		}

		const keyboardLink = Markup.inlineKeyboard([
			[Markup.button.callback(" ", `tick-0-0-${gameName}`), Markup.button.callback(" ", `tick-0-1-${gameName}`), Markup.button.callback(" ", `tick-0-2-${gameName}`), Markup.button.callback(" ", `tick-0-3-${gameName}`), Markup.button.callback(" ", `tick-0-4-${gameName}`), Markup.button.callback(" ", `tick-0-5-${gameName}`), Markup.button.callback(" ", `tick-0-6-${gameName}`), Markup.button.callback(" ", `tick-0-7-${gameName}`)],
			[Markup.button.callback(" ", `tick-1-0-${gameName}`), Markup.button.callback(" ", `tick-1-1-${gameName}`), Markup.button.callback(" ", `tick-1-2-${gameName}`), Markup.button.callback(" ", `tick-1-3-${gameName}`), Markup.button.callback(" ", `tick-1-4-${gameName}`), Markup.button.callback(" ", `tick-1-5-${gameName}`), Markup.button.callback(" ", `tick-1-6-${gameName}`), Markup.button.callback(" ", `tick-1-7-${gameName}`)],
			[Markup.button.callback(" ", `tick-2-0-${gameName}`), Markup.button.callback(" ", `tick-2-1-${gameName}`), Markup.button.callback(" ", `tick-2-2-${gameName}`), Markup.button.callback(" ", `tick-2-3-${gameName}`), Markup.button.callback(" ", `tick-2-4-${gameName}`), Markup.button.callback(" ", `tick-2-5-${gameName}`), Markup.button.callback(" ", `tick-2-6-${gameName}`), Markup.button.callback(" ", `tick-2-7-${gameName}`)],
			[Markup.button.callback(" ", `tick-3-0-${gameName}`), Markup.button.callback(" ", `tick-3-1-${gameName}`), Markup.button.callback(" ", `tick-3-2-${gameName}`), Markup.button.callback(pfB, `tick-3-3-${gameName}`), Markup.button.callback(pfW, `tick-3-4-${gameName}`), Markup.button.callback(" ", `tick-3-5-${gameName}`), Markup.button.callback(" ", `tick-3-6-${gameName}`), Markup.button.callback(" ", `tick-3-7-${gameName}`)],
			[Markup.button.callback(" ", `tick-4-0-${gameName}`), Markup.button.callback(" ", `tick-4-1-${gameName}`), Markup.button.callback(" ", `tick-4-2-${gameName}`), Markup.button.callback(pfW, `tick-4-3-${gameName}`), Markup.button.callback(pfB, `tick-4-4-${gameName}`), Markup.button.callback(" ", `tick-4-5-${gameName}`), Markup.button.callback(" ", `tick-4-6-${gameName}`), Markup.button.callback(" ", `tick-4-7-${gameName}`)],
			[Markup.button.callback(" ", `tick-5-0-${gameName}`), Markup.button.callback(" ", `tick-5-1-${gameName}`), Markup.button.callback(" ", `tick-5-2-${gameName}`), Markup.button.callback(" ", `tick-5-3-${gameName}`), Markup.button.callback(" ", `tick-5-4-${gameName}`), Markup.button.callback(" ", `tick-5-5-${gameName}`), Markup.button.callback(" ", `tick-5-6-${gameName}`), Markup.button.callback(" ", `tick-5-7-${gameName}`)],
			[Markup.button.callback(" ", `tick-6-0-${gameName}`), Markup.button.callback(" ", `tick-6-1-${gameName}`), Markup.button.callback(" ", `tick-6-2-${gameName}`), Markup.button.callback(" ", `tick-6-3-${gameName}`), Markup.button.callback(" ", `tick-6-4-${gameName}`), Markup.button.callback(" ", `tick-6-5-${gameName}`), Markup.button.callback(" ", `tick-6-6-${gameName}`), Markup.button.callback(" ", `tick-6-7-${gameName}`)],
			[Markup.button.callback(" ", `tick-7-0-${gameName}`), Markup.button.callback(" ", `tick-7-1-${gameName}`), Markup.button.callback(" ", `tick-7-2-${gameName}`), Markup.button.callback(" ", `tick-7-3-${gameName}`), Markup.button.callback(" ", `tick-7-4-${gameName}`), Markup.button.callback(" ", `tick-7-5-${gameName}`), Markup.button.callback(" ", `tick-7-6-${gameName}`), Markup.button.callback(" ", `tick-7-7-${gameName}`)],
		]);

		const board = JSON.parse('[[-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1, 0, 1,-1,-1,-1],[-1,-1,-1, 1, 0,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1]]');
		this.updateKeyboardWithValidMoves(keyboardLink.reply_markup.inline_keyboard, board, gameName, 0)
		let turn = user.user.first_name;

		ctx.replyWithPhoto({ source: createReadStream('./assets/sfidaOthello.jpg') }, {
			caption: `${ctx.from?.first_name} ha lanciato la sfida a ${user.user.first_name} (@${user.user.username ? user.user.username : '?'})` + "\r\n" + `${pfB} ${turn} è il tuo turno`,
			parse_mode: 'HTML',
			reply_markup: keyboardLink.reply_markup
		})
			.then(async (msg) => await promisePool.query("INSERT INTO `othello` (telegram_chat_id_fk, `message`, `challenger`, `challenged`, `round`, `board`) VALUES (?, ?, ?, ?, ?, ?)",
				[ctx.chat?.id, msg.message_id, ctx.from?.id, user.user.id, 0, '[[-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1, 0, 1,-1,-1,-1],[-1,-1,-1, 1, 0,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1]]']));
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
		  AND s.game_id_fk = 2
		ORDER BY s.score DESC
		LIMIT 10`, [chatId]
		);
		if (rows.length === 0)
			return "Nessun classificato"
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
