import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);


export async function getServicesInfo(servicesName: string[]) {
   const servicesBashArr = servicesName.reduce((acc, name) => acc + ` "${name}"`, "");
   const script = `
   for service in ${servicesBashArr}; do
      status=$(systemctl show "$service" --property=ActiveState,SubState,Description --no-pager)
      active_state=$(echo "$status" | grep "ActiveState" | cut -d= -f2)
      sub_state=$(echo "$status" | grep "SubState" | cut -d= -f2)
      description=$(echo "$status" | grep "Description" | cut -d= -f2)

      echo "$active_state!@sep!$sub_state!@sep!$description"
   done;`;

   try {
      const { stdout } = await execAsync(
         `bash -c '${script.replace(/'/g, "\\'")}'`, {
         shell: '/bin/bash',
      });

      const servicesStatus = stdout.trim().split('\n').map(line => {
         const [activeState, subState, description] = line.split('!@sep!');
         return {
            activeState: activeState,
            subState: subState,
            description: description,
         };
      });
      return servicesStatus;
   } catch (error) {
      console.error('Error executing command:', error);
      throw error;
   }
}