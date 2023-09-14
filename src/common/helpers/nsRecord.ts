import * as dns from 'dns';
import { promisify } from 'util';

export const getNsRecords = async (domain: string): Promise<string[]> => {
  try {
    const resolveNsAsync = promisify(dns.resolveNs);

    return await resolveNsAsync(domain);
  } catch {
    return [];
  }
};
