const { app, Tray, Menu, shell, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let tray;
let serverProcess;

// Prevent double launch
const gotTheLock = app.requestSingleInstanceLock();
console.log('Got the lock:', gotTheLock);

if (!gotTheLock) {
	console.log('Quitting because another instance is already running.');
	app.quit();
} else {
	console.log('Starting app...');
	app.on('second-instance', () => {
		// Bring window to front if already launched
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
			// Behavior when clicking Dock icon (e.g. macOS)
			// Open browser here if needed
			shell.openExternal('http://localhost:5050');
		});
	});
}

function startServer() {
	// Launch Express server as a separate process
	const serverPath = path.join(__dirname, '../server/server.js');
	serverProcess = fork(serverPath, [], {
		env: { ...process.env, PORT: 5050 }, // Port specification, etc.
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
			label: 'Open Nooklog',
			click: () => {
				// Open with default browser
				shell.openExternal('http://localhost:5050');
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

	tray.setToolTip('Nooklog');
	tray.setContextMenu(contextMenu);

	// Open browser when tray icon is clicked
	tray.on('click', () => {
		shell.openExternal('http://localhost:5050');
	});
}

// Processing on app exit
app.on('before-quit', () => {
	app.isQuiting = true;
	if (serverProcess)
		serverProcess.kill();
});

// Do not exit when all windows are closed (for tray residence)
app.on('window-all-closed', () => {
	// Ensure residence even outside macOS by skipping app.quit() here
});
