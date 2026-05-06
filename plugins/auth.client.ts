export default defineNuxtPlugin(async () => {
    const path = window.location.pathname;

    // Auth0 redirects to /a0callback?code=... after login.
    if (path === '/a0callback') {
        return;
    }
    // /welcome is the marketing splash — no auth required.
    if (path === '/welcome') {
        return;
    }

    const { setUserFromCookie, setUserFromString } = useUserState();
    const userName = useRuntimeConfig().public.userName;

    if (userName && userName.length > 0) {
        setUserFromString(userName);
    } else {
        const result = await setUserFromCookie();

        if (!result) {
            navigateTo('/logout');
        }
    }
});
