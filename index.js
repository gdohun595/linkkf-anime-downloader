const { mkdirSync, writeFileSync } = require('fs');
const { v1: uuid } = require('uuid');
const { spawn } = require('child_process');
const { convert } = require('subsrt');

const puppeteer = require('puppeteer-extra');
const { DEFAULT_INTERCEPT_RESOLUTION_PRIORITY } = require('puppeteer');
const { PuppeteerExtraPluginAdblocker } = require('puppeteer-extra-plugin-adblocker');
puppeteer.use(
    new PuppeteerExtraPluginAdblocker({
        interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
    }),
);

async function main(id) {
    const browser = await puppeteer.launch({ 
        headless: true, 
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    });
    const page = await browser.newPage();
    await page.goto('https://linkkf.net/ani/' + id);

    const processorId = uuid();
    mkdirSync(processorId);
    
    let episodes = await page.$$eval('.ep', episodes => episodes.reverse().map(episode => episode.href))
    for (let index = 1; index <= episodes.length; index++) {
        let episode = episodes[index - 1];
        let [, subtitleResponse] = await Promise.all([
            page.goto(episode),
            page.waitForResponse(
                response => response.url().endsWith('.vtt'),
            ),
        ]);
        let subtitle = await subtitleResponse.text();
        subtitle = convert(subtitle, { format: 'ass', fps: 30 });
        writeFileSync(`${processorId}/${index}화 자막.ass`, subtitle)

        let streamElement = await page.$('body');
        let [, streamResponse] = await Promise.all([
            streamElement.click(),
            page.waitForResponse(
                response => response.url().endsWith('.m3u8'),
            ),
        ]);
        let stream = await streamResponse.text();
        writeFileSync(`${processorId}/${index}.m3u8`, stream);

        let ffmpegProcess = spawn(
            'ffmpeg.exe', 
            [
                '-hwaccel', 'cuda',
                '-protocol_whitelist', 'file,http,https,tcp,tls', 
                '-hwaccel', 'cuda',
                '-i', `${processorId}/${index}.m3u8`, 
                '-codec', 'copy',
                `${processorId}/${index}화.mp4`,
            ],
        );
        ffmpegProcess.stderr.setEncoding('utf-8');
        ffmpegProcess.stderr.on(
            'data',
            data => console.log(index.toString() + ':', data),
        );
        ffmpegProcess.on(
            'exit',
            () => {
                console.log(`${index}화 다운로드가 완료 되었습니다.`)
                let ffmpegSubtitleProcess = spawn(
                    'ffmpeg.exe', 
                    [
                        '-hwaccel', 'cuda',
                        '-i', `${processorId}/${index}화.mp4`, 
                        '-i', `${processorId}/${index}화 자막.ass`, 
                        '-c', 'copy',
                        '-c:s', 'mov_text',
                        `${processorId}/${index}화 자막.mp4`,
                    ],
                );
                ffmpegSubtitleProcess.stderr.setEncoding('utf-8');
                return ffmpegSubtitleProcess.stderr.on(
                    'data',
                    data => console.log(data),
                );
            }
        );
    }
    return await browser.close();
}
