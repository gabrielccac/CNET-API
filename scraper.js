import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Xvfb from 'xvfb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

puppeteerExtra.use(StealthPlugin());

// Configuração do Xvfb
const xvfb = new Xvfb({
    silent: true,
    xvfb_args: ['-screen', '0', '1920x1080x24', '-ac'],
});

console.log('Iniciando Xvfb...');
xvfb.startSync();
console.log('Xvfb iniciado com sucesso. Display:', process.env.DISPLAY);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function setupDownloadPath() {
    const downloadPath = path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }
    return downloadPath;
}

function convertFileToBase64(filePath) {
    return fs.readFileSync(filePath, { encoding: 'base64' });
}

async function checkForEditalLink(page) {
    try {
        const editalLink = await page.waitForSelector('a.p-menuitem-link span.p-menuitem-text', {
            visible: true,
            timeout: 5000
        });

        const linkText = await page.evaluate(element => element.textContent, editalLink);
        if (linkText.trim() === 'Edital') {
            return editalLink;
        }
    } catch (error) {
        console.log('Link do Edital não encontrado nesta tentativa');
    }
    return null;
}

async function tryClickInfoButton(page) {
    try {
        const infoButton = await page.waitForSelector('button.br-button.ml-auto.secondary i.fa-info-circle', {
            visible: true,
            timeout: 5000
        });

        if (infoButton) {
            await infoButton.click();
            return true;
        }
    } catch (error) {
        return false;
    }
    return false;
}

export async function downloadAndExtractData(url) {
    const downloadPath = setupDownloadPath();
    let browser;

    try {
        console.log('Iniciando browser com display:', process.env.DISPLAY);
        browser = await puppeteerExtra.launch({
            headless: false,
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--start-maximized',
                `--display=${process.env.DISPLAY}`
            ]
        });

        const page = await browser.newPage();
        const client = await page.target().createCDPSession();
        let downloadFilename = null;
        let downloadComplete = false;

        await client.send('Browser.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath,
            eventsEnabled: true
        });

        client.on('Browser.downloadWillBegin', (event) => {
            if (event.suggestedFilename) {
                downloadFilename = event.suggestedFilename;
            }
        });

        client.on('Browser.downloadProgress', async (event) => {
            if (event.state === 'completed') {
                downloadComplete = true;
            }
        });

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(window.navigator, 'userAgent', {
                get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0'
            });
        });

        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
        
        const initialDownloadButton = await page.waitForSelector('button.br-button.secondary i.fa-download', {
            visible: true,
            timeout: 30000
        });

        await initialDownloadButton.click();
        await sleep(2000);

        const downloadButtons = await page.$$('button.br-button.secondary i.fa-download');
        let downloadSuccess = false;

        for (let i = 0; i < downloadButtons.length && !downloadSuccess; i++) {
            await downloadButtons[i].click();
            await sleep(2000 + Math.random() * 500);

            const editalLink = await checkForEditalLink(page);
            if (editalLink) {
                downloadComplete = false;
                await editalLink.click();

                let waitTime = 0;
                while (!downloadComplete && waitTime < 30000) {
                    await sleep(1000);
                    waitTime += 1000;
                }

                if (downloadComplete) {
                    downloadSuccess = true;
                }
            }
        }

        let clickSuccess = await tryClickInfoButton(page);
        if (!clickSuccess) {
            await sleep(1500);
            clickSuccess = await tryClickInfoButton(page);
        }

        if (!clickSuccess) {
            throw new Error('Não foi possível clicar no botão de informações após duas tentativas');
        }

        await page.waitForSelector('.br-modal-body', { timeout: 30000 });
        
        const extractedData = await page.evaluate(() => {
            const getValue = (labelText) => {
                const label = Array.from(document.querySelectorAll('label')).find(
                    el => el.textContent.trim() === labelText
                );
                return label ? label.nextElementSibling?.textContent.trim() : null;
            };

            return {
                tipoObjeto: getValue('Tipo de objeto'),
                objeto: getValue('Objeto'),
                periodoEntregaProposta: getValue('Período para entrega de proposta'),
                dataAberturaSessaoPublica: getValue('Data abertura da sessão pública') ? getValue('Data abertura da sessão pública') : getValue('Data prevista para abertura da sessão pública'),
                responsavelDesignadoCompra: getValue('Responsável designado para a compra'),
                uf: getValue('UF da UASG'),
                idContratacaoPNCP: getValue('Id contratação PNCP')
            };
        });

        let fileData = null;
        if (downloadSuccess && downloadFilename) {
            const filePath = path.join(downloadPath, downloadFilename);
            fileData = {
                name: downloadFilename,
                path: filePath,
                content: convertFileToBase64(filePath)
            };
            
            // Limpar o arquivo após converter para base64
            fs.unlinkSync(filePath);
        }

        return {
            success: true,
            downloadSuccess,
            fileData,
            extractedData
        };

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}