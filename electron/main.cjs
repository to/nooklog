const { app, Tray, Menu, shell, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;
let tray;
let serverProcess;

// 二重起動防止
const gotTheLock = app.requestSingleInstanceLock();
console.log('Got the lock:', gotTheLock);

if (!gotTheLock) {
	console.log('Quitting because another instance is already running.');
	app.quit();
} else {
	console.log('Starting app...');
	app.on('second-instance', () => {
		// 既に起動していたらウィンドウを表示
		if (mainWindow) {
			if (mainWindow.isMinimized())
				mainWindow.restore();
			mainWindow.show();
			mainWindow.focus();
		}
	});

	app.whenReady().then(() => {
		console.log('App is ready!');
		startServer();
		createTray();

		app.on('activate', () => {
			// Dockアイコンクリック時などの挙動（macOSなど）
			// 必要ならここでブラウザを開く
			shell.openExternal('http://localhost:3000');
		});
	});
}

function startServer() {
	// Expressサーバーを別プロセスとして起動
	const serverPath = path.join(__dirname, '../server/server.js');
	serverProcess = fork(serverPath, [], {
		env: { ...process.env, PORT: 3000 }, // ポート指定など
	});

	serverProcess.on('error', err => {
		console.error('Failed to start server process:', err);
	});

	console.log(`Server started with PID: ${serverProcess.pid}`);
}

function createTray() {
	const iconPath = path.join(__dirname, 'icon_32.png');
	tray = new Tray(iconPath);

	const contextMenu = Menu.buildFromTemplate([
		{
			label: 'Open Nookmark',
			click: () => {
				// デフォルトブラウザで開く
				shell.openExternal('http://localhost:3000');
			},
		},
		{ type: 'separator' },
		{
			label: 'Quit',
			click: () => {
				app.isQuiting = true;
				app.quit();
			},
		},
	]);

	tray.setToolTip('Nookmark');
	tray.setContextMenu(contextMenu);

	// トレイアイコンをクリックしたらブラウザを開く
	tray.on('click', () => {
		shell.openExternal('http://localhost:3000');
	});
}

// アプリ終了時の処理
app.on('before-quit', () => {
	app.isQuiting = true;
	if (serverProcess)
		serverProcess.kill();
});

// 全ウィンドウが閉じられても終了しない（トレイ常駐のため）
app.on('window-all-closed', () => {
	// macOS以外でも、ここでapp.quit()しないことで常駐を実現
});
