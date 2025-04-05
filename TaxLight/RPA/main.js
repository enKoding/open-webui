const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { get } = require('https');
const { get: getHttp } = require('http');

(async () => {
    const url = 'https://www3.sii.cl/normaInternet/';
    const waitTime = 2000; // Tiempo de espera en milisegundos
    const downloadFolder = path.join(__dirname, './ACN'); // Carpeta de descargas

    if (!fs.existsSync(downloadFolder)) {
        fs.mkdirSync(downloadFolder, { recursive: true });
    }

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920 / 2, height: 1080 });

    async function downloadPDF(url, filename) {
        const filePath = path.join(downloadFolder, filename);
        const file = fs.createWriteStream(filePath);

        function handleResponse(response) {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log(`Descargado: ${filename}`);
                    console.log(`Archivo ${filename} descargado y guardado en ${filePath}`);
                });
            } else if (response.statusCode === 302 || response.statusCode === 301) {
                const newUrl = response.headers.location;
                console.log(`Redirigido: ${url} → ${newUrl}`);
                if (newUrl) {
                    downloadPDF(newUrl, filename);
                } else {
                    console.error(`Error: Redirección sin nueva URL para ${filename}`);
                }
            } else {
                console.error(`Error descargando ${filename}: Código de estado ${response.statusCode}`);
            }
        }

        const protocol = url.startsWith('https') ? get : getHttp;
        console.log(`Intentando descargar: ${url}`);

        protocol(url, handleResponse).on('error', error => {
            console.error(`Error descargando ${filename}:`, error);
        });
    }

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        await page.waitForSelector('#main > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr:nth-child(4) > td > table > tbody > tr > td:nth-child(1) > div > a', { timeout: 5000 });

        let mainLinks = await page.$$('#main > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr:nth-child(4) > td > table > tbody > tr > td:nth-child(1) > div > a');

        if (mainLinks.length === 0) {
            console.log('No se encontraron enlaces principales.');
        }

        for (let i = 0; i < mainLinks.length; i++) {
            mainLinks = await page.$$('#main > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr:nth-child(4) > td > table > tbody > tr > td:nth-child(1) > div > a');

            if (mainLinks[i]) {
                const mainText = await page.evaluate(el => el.textContent.trim(), mainLinks[i]);
                console.log(`Ingresando a: ${mainText}`);

                await mainLinks[i].click();
                await page.waitForNavigation({ waitUntil: 'domcontentloaded' });

                await new Promise(resolve => setTimeout(resolve, waitTime));

                let subLinks = await page.$$('#main > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr:nth-child(3) > td > table > tbody > tr > td.NormativaEnlace');

                for (let j = 0; j < subLinks.length; j++) {
                    subLinks = await page.$$('#main > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr:nth-child(3) > td > table > tbody > tr > td.NormativaEnlace');

                    if (subLinks[j]) {
                        const subText = await page.evaluate(el => el.textContent.trim(), subLinks[j]);
                        console.log(`Ingresando a sub-enlace: ${subText}`);

                        await subLinks[j].click();
                        await page.waitForNavigation({ waitUntil: 'domcontentloaded' });

                        await new Promise(resolve => setTimeout(resolve, waitTime));

                        let pdfLinks = await page.$$eval('a[href$=".pdf"]', links => links.map(link => link.href));

                        for (let pdfUrl of pdfLinks) {
                            const pdfName = path.basename(new URL(pdfUrl).pathname);
                            await downloadPDF(pdfUrl, pdfName);
                        }

                        console.log(`Regresando al nivel anterior.`);
                        await page.goBack({ waitUntil: 'domcontentloaded' });

                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                }

                console.log(`Regresando a la página principal.`);
                await page.goBack({ waitUntil: 'domcontentloaded' });

                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await browser.close();
    }
})();
