/**
 * Gateway singleton — wires up the Protocol Gateway ACL for use by
 * HTTP and MCP protocol adapters.
 */

import { sessionStore, eventStore } from './store.js';
import { AgreementService } from '../contexts/agreement/agreement-service.js';
import { GatewayService } from '../contexts/gateway/gateway-service.js';

const agreementService = new AgreementService(
  (code) => sessionStore.getSession(code),
  eventStore
);
export const gateway = new GatewayService(sessionStore, agreementService, eventStore);
