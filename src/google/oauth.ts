import { google } from 'googleapis';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } from '../env';

export const loginOauthClient = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
);

export function createOauthClient() {
    return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

export async function fetchGoogleUserInfo(oauthClient: InstanceType<typeof google.auth.OAuth2>) {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauthClient });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email ?? null;
    const id = userInfo.data.id ?? null;
    return { email, id };
}
