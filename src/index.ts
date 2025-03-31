import { Elysia, t } from 'elysia';
import { node } from '@elysiajs/node';

import { createWidgetResponse } from './widget';
import { parseArgs, type ParseArg_Template } from './utilities';
import * as template from './template';

const argvTemplate: ParseArg_Template = {
	port: {
		pattern: ['--port', '-p'],
		type: 'int',
		default: 8080,
	}
}

const argv = process.argv.slice(2);
const options = parseArgs(argv, argvTemplate);

template.loadTemplate();
template.watchTemplates();

new Elysia({
	adapter: typeof Bun === 'undefined'? node() : undefined
})
	.get('/', ({ query, set }) => {
		const services = query.services?.split(',') || [];
		const servicesTitle = query.servicesTitle?.split(',') || [];
		const customTitle = query.title || 'Systemd Services';

		return createWidgetResponse(set, services, servicesTitle, customTitle);
	}, {
		query: t.Object({
			services: t.String(),
			servicesTitle: t.Optional(t.String()),
			title: t.Optional(t.String()),
		})
	})
	.listen(options.port.valueOf(), ({ hostname, port }) => {
		console.log(
			`🚀 Systemd-glance is running at ${hostname}:${port}`
		);
	});

