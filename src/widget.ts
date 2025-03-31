import { getServicesInfo } from './systemd';
import * as template from './template';

export async function createWidgetResponse(
   set: any,
   serviceNames: string[],
   serviceTitles: string[] = [],
   title: string = 'System Services'
): Promise<string> {
   let status = await getServicesInfo(serviceNames);
   let servicesHTMLList: string[] = [];
   let html: string;
   let templateName = 'service';

   try {
      for(let i = 0; i < serviceNames.length; i++) {
         const serviceName = serviceNames[i].trim();
         const serviceTitle = serviceTitles[i].trim() || serviceName;

         servicesHTMLList.push(template.resolveTemplate('service', {
            'service.activeState': status[i].activeState,
            'service.subState': status[i].subState,
            'service.name': serviceName,
            'service.title': serviceTitle,
            'service.description': status[i].description,
         }) + '\n');
      }

      html = template.resolveTemplate(templateName = 'widget', {
         'serviceElements': servicesHTMLList,
      });
   }
   catch(error) {
      console.error(`Error resolving template "${templateName}": ` + (error as Error).stack);
      set.status = 500;
      return `Error resolving template "${templateName}": ` + (error as Error).message;
   }

   set.headers['Content-Type'] = 'text/html; charset=utf-8';
   set.headers['Widget-Title'] = title;
   set.headers['Widget-Content-Type'] = 'html';
   return html;
}