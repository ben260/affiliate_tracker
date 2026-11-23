import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { AppError } from './errors.ts';
import {
  buildAffiliateReport,
  recordClick,
  recordDailyPlayerActivity,
  recordPlayerEvent,
} from './services.ts';
import {
  parseDailyPlayerActivity,
  parsePlayerEvent,
  parseReportRange,
  parseTimestamp,
} from './validation.ts';

const app: Express = express();
const replayMode = process.env.REPLAY === '1';

app.use(express.json());

if (replayMode) {
  app.set('trust proxy', true);
  console.log('Replay mode enabled');
}

app.get('/click', (req: Request, res: Response) => {
  const { aff, campaign, sub } = req.query;

  if (
    typeof aff !== 'string' ||
    typeof campaign !== 'string' ||
    typeof sub !== 'string'
  ) {
    throw new AppError(400, 'Bad query');
  }

  const eventTime = replayMode ? req.get('x-event-time') : undefined;
  const createdAt =
    eventTime === undefined
      ? undefined
      : new Date(parseTimestamp(eventTime, 'X-Event-Time'));

  console.log(
    `Click received: aff=${aff}, campaign=${campaign}, sub=${sub}, ` +
      `ip=${req.ip}, userAgent=${req.get('user-agent')}` +
      (replayMode ? `, eventTime=${eventTime}` : ''),
  );

  const redirectUrl = recordClick(
    aff,
    campaign,
    sub,
    req.ip ?? '',
    req.get('user-agent') ?? '',
    createdAt,
  );

  res.redirect(302, redirectUrl);
});

app.post('/postback', (req: Request, res: Response) => {
  const body: unknown = req.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AppError(400, 'Body must be a JSON object');
  }
  const fields = body as Record<string, unknown>;

  switch (fields.event) {
    case 'registration':
    case 'ftd':
    case 'deposit':
      recordPlayerEvent(parsePlayerEvent(fields, fields.event));
      break;
    case 'activity':
      recordDailyPlayerActivity(parseDailyPlayerActivity(fields));
      break;
    default:
      throw new AppError(400, 'Unknown event type');
  }

  res.json({ status: 'received' });
});

app.get(
  '/affiliates/:id/report',
  (req: Request<{ id: string }>, res: Response) => {
    const { from, to } = parseReportRange(req.query);
    res.json(buildAffiliateReport(req.params.id, from, to));
  },
);

function isClientError(
  err: unknown,
): err is { status: number; message: string } {
  return (
    err instanceof Error &&
    'status' in err &&
    typeof err.status === 'number' &&
    err.status >= 400 &&
    err.status < 500
  );
}

// Express only treats a handler as an error handler if it takes 4 arguments.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // Client errors raised by express.json(), e.g. malformed JSON (400) or a
  // body over the size limit (413). These are the sender's fault, not a 500.
  if (isClientError(err)) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(3000);
