import { STAFF_SESSION_COOKIE, travelYearRange } from '@travel-rock/shared';
import { apiTestEnv, apiTestUrl, E2E_USERS } from './test-env';

const MAILPIT = apiTestEnv['MAILPIT_API_URL'] ?? 'http://127.0.0.1:8025/api/v1';

/** Latest verification code emailed to `to` (Mailpit inbox of docker-compose). */
export async function latestCodeFor(to: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = (await (
      await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`)
    ).json()) as {
      messages: { ID: string }[];
    };
    const latest = search.messages[0];
    if (latest) {
      const message = (await (await fetch(`${MAILPIT}/message/${latest.ID}`)).json()) as {
        Text: string;
      };
      const code = /Tu código de verificación es (\d{6})\./.exec(message.Text)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No verification email for ${to}`);
}

type Credentials = { email: string; password: string };

/** Staff session cookie, through the real login endpoint. */
export async function staffCookie(
  { email, password }: Credentials = E2E_USERS.commercial,
): Promise<string> {
  const response = await fetch(`${apiTestUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${STAFF_SESSION_COOKIE}=`));
  if (!cookie) throw new Error('E2E: staff login failed');
  return cookie.split(';')[0]!;
}

export async function staffPost<T = { id: string }>(
  cookie: string,
  path: string,
  body: object,
): Promise<T> {
  const response = await fetch(`${apiTestUrl}/api/admin${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`E2E: POST ${path} failed with ${response.status}`);
  return (await response.json()) as T;
}

/** Catalog data the family will search for, created through the staff API. */
export async function createSchoolWithGroup(
  school: { name: string; province: string; city: string },
  groupName: string,
  options: {
    accessCode?: boolean;
    publishedProposal?: boolean;
    /** The same priced proposal, left as a draft. */
    draftProposal?: boolean;
    as?: Credentials;
  } = {},
): Promise<{
  schoolId: string;
  groupId: string;
  accessCode: string | null;
  proposalId: string | null;
}> {
  const cookie = await staffCookie(options.as);
  const created = await staffPost(cookie, '/schools', school);
  const group = await staffPost(cookie, '/school-groups', {
    schoolId: created.id,
    name: groupName,
    travelYear: travelYearRange().min + 2,
  });
  const accessCode = options.accessCode
    ? (
        await staffPost<{ accessCode: string }>(
          cookie,
          `/school-groups/${group.id}/access-code`,
          {},
        )
      ).accessCode
    : null;
  let proposalId: string | null = null;
  if (options.publishedProposal || options.draftProposal) {
    // DOMAIN.md worked example: total payable $ 3.718.927,69.
    const suffix = school.name.replace(/\W/g, '').slice(-12);
    const items = [];
    for (const [name, price] of [
      ['Transporte', '110000000'],
      ['Alojamiento', '150000000'],
      ['Excursiones', '50000000'],
    ] as const) {
      const service = await staffPost(cookie, '/services', {
        name: `${name} ${suffix}`,
        category: 'OTHER',
        basePriceMinor: price,
      });
      items.push({ serviceId: service.id, quantity: 1 });
    }
    const draft = await staffPost(cookie, '/proposals', { schoolGroupId: group.id });
    const put = await fetch(`${apiTestUrl}/api/admin/proposals/${draft.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        items,
        commercialDiscountMinor: '10000000',
        downPaymentMinor: '60000000',
        installments: 18,
        tnaBps: 3500,
        validUntil: new Date(Date.now() + 60 * 86_400_000).toISOString(),
      }),
    });
    if (!put.ok) throw new Error(`E2E: PUT proposal failed with ${put.status}`);
    if (options.publishedProposal) await staffPost(cookie, `/proposals/${draft.id}/publish`, {});
    proposalId = draft.id;
  }
  return { schoolId: created.id, groupId: group.id, accessCode, proposalId };
}
