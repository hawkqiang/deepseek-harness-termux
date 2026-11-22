/*
 * flock.c — minimal POSIX flock(2) binding for @deepseek-ai/node-addon-system
 * on Android/Termux.
 *
 * Upstream ships prebuilt `system.node` addons for darwin/linux (glibc|musl)
 * only — there is no android optional package, so on Termux every session
 * open (headless or web) failed with "dsh: flock is not supported on
 * android-<arch>". bionic exposes flock(2) via <sys/file.h>, so this binding
 * is a thin N-API wrapper with the exact surface the JS loader expects:
 *
 *     tryLock(fd, cb)  ->  flock(fd, LOCK_EX | LOCK_NB), cb(errno)
 *
 * errno is 0 on success, EAGAIN/EWOULDBLOCK on contention, and the failing
 * syscall's errno otherwise. The call is synchronous (non-blocking flock is
 * instantaneous), so invoking the callback immediately is safe. install.sh
 * compiles this source with node-gyp and installs the result at
 * node_modules/@deepseek-ai/node-addon-system/bin/android-<arch>/system.node —
 * the location patches/09-node-addon-system-android-flock.patch teaches
 * lib/flock.js to load on Android.
 */

#include <errno.h>
#include <node_api.h>
#include <sys/file.h>

static napi_value TryLock(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value argv[2] = { 0 };
    if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 2) {
        napi_throw_type_error(env, NULL, "tryLock(fd, cb) expects 2 arguments");
        return NULL;
    }

    int fd = -1;
    if (napi_get_value_int32(env, argv[0], &fd) != napi_ok) {
        napi_throw_type_error(env, NULL, "tryLock: fd must be a number");
        return NULL;
    }

    const int rc = flock(fd, LOCK_EX | LOCK_NB);
    const int errno_out = (rc == 0) ? 0 : errno;

    napi_value err_value = NULL;
    if (napi_create_int32(env, errno_out, &err_value) != napi_ok) {
        return NULL;
    }

    napi_value global = NULL;
    if (napi_get_global(env, &global) != napi_ok) {
        return NULL;
    }

    napi_value ignored = NULL;
    if (napi_call_function(env, global, argv[1], 1, &err_value, &ignored) != napi_ok) {
        napi_throw_error(env, NULL, "tryLock: callback invocation failed");
    }
    return NULL;
}

static napi_value Init(napi_env env, napi_value exports) {
    napi_value fn = NULL;
    if (napi_create_function(env, "tryLock", NAPI_AUTO_LENGTH, TryLock, NULL, &fn) != napi_ok) {
        return NULL;
    }
    if (napi_set_named_property(env, exports, "tryLock", fn) != napi_ok) {
        return NULL;
    }
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
