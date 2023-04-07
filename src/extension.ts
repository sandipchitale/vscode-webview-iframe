import * as express from 'express';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import * as vscode from 'vscode';

import * as path from 'path';
import * as os from 'os';
import * as download from 'download';
import { AddressInfo } from 'net';

let PORT = 7654;

const START_SPRING_IO = 'https://start.spring.io';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('vscode-webview-iframe.start', () => {
      WebsitePanel.createOrShow(context.extensionUri);
    })
  );

  const app = express();

  app.use(function (req, res, next) {
    if (req.url.startsWith('/starter.zip')) {
      WebsitePanel.hide();
      setTimeout(async () => {
        const projectName = req.url.replace(/.+&baseDir=/, '').replace(/&.+/, '');
        if (projectName) {
          const extractDirectoryUris: vscode.Uri[] | undefined = await vscode.window.showOpenDialog({
            defaultUri: vscode.Uri.file(os.tmpdir()),
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Extract',
            title: `Directory to extract project ${projectName}`
          });
          if (extractDirectoryUris && extractDirectoryUris.length > 0) {
            try {
              await download(`${START_SPRING_IO}${req.url}`, extractDirectoryUris[0].fsPath, {
                extract: true
              });
              vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(path.join(extractDirectoryUris[0].fsPath, projectName)), {
                forceNewWindow: true
              });
            } catch (error) {
              //
            }
          }
        }
      }, 0);
      return res.status(204).send();
    }
    next();
});

  app.use('/**',
    createProxyMiddleware({
      target: START_SPRING_IO,
      changeOrigin: true,
      followRedirects: true,
      onProxyRes: (proxyRes, req, res) => {
        delete proxyRes.headers['x-frame-options'];
        delete proxyRes.headers['X-Frame-Options'];
        delete proxyRes.headers['content-security-policy'];
        delete proxyRes.headers['Content-Security-Policy'];
      }
    })
  );

  const server = app.listen(() => {
    PORT = (server.address() as AddressInfo).port;
  });
}

/**
 * Manages Spring Initializr webview panel
 */
class WebsitePanel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: WebsitePanel | undefined;

  public static readonly viewType = 'webview-iframe';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    // If we already have a panel, show it.
    if (WebsitePanel.currentPanel) {
      WebsitePanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      WebsitePanel.viewType,
      'Webview iframe',
      column || vscode.ViewColumn.One,
      {
        // Enable javascript in the webview
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.parse(`http://localhost:${PORT}/`),
          vscode.Uri.parse(START_SPRING_IO)
        ]
      }
    );

    WebsitePanel.currentPanel = new WebsitePanel(panel, extensionUri);
  }

  public static hide() {
    if (WebsitePanel.currentPanel) {
      WebsitePanel.currentPanel._panel.dispose();
      WebsitePanel.currentPanel = undefined;
    }
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    WebsitePanel.currentPanel = new WebsitePanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public dispose() {
    WebsitePanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode-webview-iframe.css');
    // Uri to load styles into webview
    const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${stylesMainUri}" rel="stylesheet">
  <title>Webview iframe</title>
</head>
<body>
  <iframe id="webview-iframe" src="http://localhost:${PORT}/"></iframe>
</body>
</html>
`;
  }
}
