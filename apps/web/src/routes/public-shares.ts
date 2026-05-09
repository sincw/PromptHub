import { Hono } from 'hono';
import { ShareService } from '../services/share.service.js';
import { success } from '../utils/response.js';

const publicShares = new Hono();
const shareService = new ShareService();

publicShares.get('/:shareId', async (c) => {
  return success(c, shareService.getPublic(c.req.param('shareId')));
});

export default publicShares;
