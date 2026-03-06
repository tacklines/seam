import { Router } from '@vaadin/router';
import { loadAndSelectOrg } from './state/org-api.js';

let router: Router | null = null;

export function initRouter(outlet: HTMLElement): Router {
  router = new Router(outlet);
  router.setRoutes([
    {
      path: '/',
      action: async (_context, commands) => {
        try {
          const org = await loadAndSelectOrg();
          return commands.redirect(`/orgs/${org.slug}`);
        } catch {
          return commands.redirect('/orgs');
        }
      },
    },
    // Legacy /projects routes redirect to default org
    {
      path: '/projects',
      action: async (_context, commands) => {
        try {
          const org = await loadAndSelectOrg();
          return commands.redirect(`/orgs/${org.slug}`);
        } catch {
          return commands.redirect('/orgs');
        }
      },
    },
    {
      path: '/projects/:id',
      action: async (context, commands) => {
        try {
          const org = await loadAndSelectOrg();
          return commands.redirect(`/orgs/${org.slug}/projects/${(context.params as Record<string, string>).id}`);
        } catch {
          return commands.redirect('/orgs');
        }
      },
    },
    {
      path: '/projects/:id/:rest(.*)',
      action: async (context, commands) => {
        try {
          const org = await loadAndSelectOrg();
          const params = context.params as Record<string, string>;
          return commands.redirect(`/orgs/${org.slug}/projects/${params.id}/${params.rest}`);
        } catch {
          return commands.redirect('/orgs');
        }
      },
    },
    // User settings
    {
      path: '/settings',
      component: 'user-settings',
      action: async () => { await import('./components/user/user-settings.js'); },
    },
    // Org routes
    {
      path: '/orgs',
      component: 'org-dashboard',
      action: async () => { await import('./components/org/org-dashboard.js'); },
    },
    {
      path: '/orgs/:slug',
      component: 'org-dashboard',
      action: async () => { await import('./components/org/org-dashboard.js'); },
    },
    {
      path: '/orgs/:slug/settings',
      component: 'org-settings',
      action: async () => { await import('./components/org/org-settings.js'); },
    },
    {
      path: '/orgs/:slug/projects/:id',
      component: 'project-workspace',
      action: async () => { await import('./components/project/project-workspace.js'); },
    },
    {
      path: '/orgs/:slug/projects/:id/:tab',
      component: 'project-workspace',
      action: async () => { await import('./components/project/project-workspace.js'); },
    },
    {
      path: '/orgs/:slug/projects/:id/tasks/:ticketId',
      component: 'project-workspace',
      action: async () => { await import('./components/project/project-workspace.js'); },
    },
    {
      path: '/orgs/:slug/projects/:id/plans/:planId',
      component: 'project-workspace',
      action: async () => { await import('./components/project/project-workspace.js'); },
    },
    {
      path: '/orgs/:slug/projects/:id/agents/:agentId',
      component: 'project-workspace',
      action: async () => { await import('./components/project/project-workspace.js'); },
    },
    // Session routes (unchanged — globally unique codes)
    {
      path: '/sessions/:code',
      component: 'session-lobby',
      action: async () => { await import('./components/session/session-lobby.js'); },
    },
    {
      path: '/sessions/:code/tasks/:ticketId',
      component: 'session-lobby',
      action: async () => { await import('./components/session/session-lobby.js'); },
    },
  ]);
  return router;
}

export function getRouter(): Router | null {
  return router;
}

export function navigateTo(path: string): void {
  Router.go(path);
}
