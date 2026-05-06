const PUBLIC_PATHS = new Set(['/a0callback', '/login', '/logout', '/welcome']);

export default defineNuxtRouteMiddleware(async (to, from) => {
    const { userIsPermitted, userName } = useUserState();

    if (!userName.value) {
        if (!PUBLIC_PATHS.has(to.path)) {
            return navigateTo('/welcome');
        }
    } else {
        if (!userIsPermitted()) {
            if (to.path !== '/pending' && to.path !== '/logout') {
                return navigateTo('/pending');
            }
        }
    }
});
