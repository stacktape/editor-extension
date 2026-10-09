import URL from 'url';
import { WorkspaceContextService } from '../yamlLanguageService';

export const workspaceContext: WorkspaceContextService = {
  resolveRelativePath: (relativePath: string, resource: string) => {
    return URL.resolve(resource, relativePath);
  }
};
