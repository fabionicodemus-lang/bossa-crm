import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProposalsManager } from '../../src/components/ProposalsManager';
declare global { interface Window { __PROPS__: Parameters<typeof ProposalsManager>[0] } }
createRoot(document.getElementById('app')!).render(<ProposalsManager {...window.__PROPS__} />);
