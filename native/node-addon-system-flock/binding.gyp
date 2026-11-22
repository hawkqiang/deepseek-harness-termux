# binding.gyp - builds `system.node` (N-API, pure C) for the flock shim that
# install.sh installs at node_modules/@deepseek-ai/node-addon-system/bin/
# android-<arch>/system.node. Consumed by lib/flock.js through
# patches/09-node-addon-system-android-flock.patch.
{
    'targets': [
        {
            'target_name': 'system',
            'sources': ['flock.c'],
            'defines': ['NAPI_DISABLE_CPP'],
        },
    ],
}
