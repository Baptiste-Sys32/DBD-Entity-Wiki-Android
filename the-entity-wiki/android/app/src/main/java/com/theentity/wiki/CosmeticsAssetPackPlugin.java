package com.theentity.wiki;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.OnCompleteListener;
import com.google.android.gms.tasks.Task;
import com.google.android.play.core.assetpacks.AssetLocation;
import com.google.android.play.core.assetpacks.AssetPackLocation;
import com.google.android.play.core.assetpacks.AssetPackManager;
import com.google.android.play.core.assetpacks.AssetPackManagerFactory;
import com.google.android.play.core.assetpacks.AssetPackState;
import com.google.android.play.core.assetpacks.AssetPackStates;
import com.google.android.play.core.assetpacks.model.AssetPackStatus;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.Map;

@CapacitorPlugin(name = "CosmeticsAssetPack")
public class CosmeticsAssetPackPlugin extends Plugin {
    private static final String TAG = "CosmeticsAssetPack";
    private static final String PACK_NAME = "cosmeticsfullsetpack";
    private static final String FULL_SET_ROOT = "dbd_images/cosmetics/full_sets/";
    private static final String FULL_SET_DIR = "dbd_images/cosmetics/full_sets";
    private static final String CACHE_ROOT = "cosmetics_full_sets_cache";

    private AssetPackManager assetPackManager;

    @Override
    public void load() {
        assetPackManager = AssetPackManagerFactory.getInstance(getContext());
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject immediate = buildImmediateStatus();
        if (immediate != null) {
            call.resolve(immediate);
            return;
        }

        assetPackManager
            .getPackStates(Collections.singletonList(PACK_NAME))
            .addOnCompleteListener(new OnCompleteListener<AssetPackStates>() {
                @Override
                public void onComplete(@NonNull Task<AssetPackStates> task) {
                    try {
                        AssetPackStates states = task.getResult();
                        AssetPackState state = resolvePackState(states);
                        if (state == null) {
                            call.resolve(buildStatus("checking", false, null, null, 0));
                            return;
                        }
                        call.resolve(buildPackStatePayload(state));
                    } catch (Exception error) {
                        Log.w(TAG, "Failed to query asset-pack status", error);
                        call.resolve(buildStatus("checking", false, null, null, 0));
                    }
                }
            });
    }

    @PluginMethod
    public void resolveAsset(PluginCall call) {
        String assetPath = normalizeAssetPath(call.getString("assetPath"));
        if (assetPath == null) {
            call.reject("A cosmetics asset path under dbd_images/cosmetics/full_sets/ is required.");
            return;
        }

        File cachedFile = getCachedAssetFile(assetPath);
        if (cachedFile == null) {
            call.reject("A cosmetics asset path under dbd_images/cosmetics/full_sets/ is required.");
            return;
        }
        if (cachedFile.isFile() && cachedFile.length() > 0) {
            call.resolve(buildResolvedAssetPayload(assetPath, cachedFile, "cache"));
            return;
        }

        ensureParentDir(cachedFile);
        try {
            if (copyFromPackAssetsPath(assetPath, cachedFile)) {
                call.resolve(buildResolvedAssetPayload(assetPath, cachedFile, "pack_assets_path"));
                return;
            }
            if (copyFromPackageAssetManager(getContext(), assetPath, cachedFile)) {
                call.resolve(buildResolvedAssetPayload(assetPath, cachedFile, "context_assets"));
                return;
            }
            if (copyFromPackageAssetManager(resolvePackageContext(), assetPath, cachedFile)) {
                call.resolve(buildResolvedAssetPayload(assetPath, cachedFile, "package_context_assets"));
                return;
            }
            if (copyFromAssetLocation(assetPath, cachedFile)) {
                call.resolve(buildResolvedAssetPayload(assetPath, cachedFile, "asset_location"));
                return;
            }
        } catch (Exception error) {
            Log.w(TAG, "Failed to resolve cosmetics asset " + assetPath, error);
        }

        if (cachedFile.exists()) {
            cachedFile.delete();
        }
        JSObject payload = buildStatus("missing", false, null, null, 0);
        payload.put("assetPath", assetPath);
        payload.put("resolvedPath", null);
        call.resolve(payload);
    }

    @PluginMethod
    public void requestDownload(PluginCall call) {
        getStatus(call);
    }

    @PluginMethod
    public void ensureAvailable(PluginCall call) {
        getStatus(call);
    }

    @PluginMethod
    public void requestConfirmation(PluginCall call) {
        getStatus(call);
    }

    private JSObject buildImmediateStatus() {
        AssetPackLocation location = assetPackManager.getPackLocation(PACK_NAME);
        boolean hasReadableLocation = isReadablePackLocation(location);
        if (hasReadableLocation || canAccessInstallTimeAssets()) {
            return buildStatus("completed", true, null, null, 0);
        }
        return null;
    }

    private JSObject buildPackStatePayload(AssetPackState state) {
        if (state == null) {
            return buildStatus("checking", false, null, null, 0);
        }
        AssetPackLocation location = assetPackManager.getPackLocation(PACK_NAME);
        boolean hasReadableLocation = isReadablePackLocation(location);
        boolean hasReadableAssets = hasReadableLocation || canAccessInstallTimeAssets();
        boolean completedButUnavailable = !hasReadableAssets && state.status() == AssetPackStatus.COMPLETED;
        boolean ready = hasReadableAssets;
        String status = ready ? "completed" : (completedButUnavailable ? "missing" : mapStatus(state.status()));
        JSObject payload = buildStatus(
            status,
            ready,
            hasReadableLocation ? location.assetsPath() : null,
            hasReadableLocation ? location.path() : null,
            state.errorCode()
        );
        payload.put("bytesDownloaded", state.bytesDownloaded());
        payload.put("totalBytesToDownload", state.totalBytesToDownload());
        return payload;
    }

    private JSObject buildStatus(String status, boolean ready, String assetsPath, String path, int errorCode) {
        JSObject payload = new JSObject();
        payload.put("supported", true);
        payload.put("packName", PACK_NAME);
        payload.put("status", status);
        payload.put("isReady", ready);
        payload.put("assetsPath", assetsPath);
        payload.put("path", path);
        payload.put("bytesDownloaded", 0);
        payload.put("totalBytesToDownload", 0);
        payload.put("errorCode", errorCode);
        payload.put("errorLabel", "");
        return payload;
    }

    private JSObject buildResolvedAssetPayload(String assetPath, File cachedFile, String strategy) {
        JSObject payload = buildStatus("completed", true, null, null, 0);
        payload.put("assetPath", assetPath);
        payload.put("resolvedPath", cachedFile.getAbsolutePath());
        payload.put("strategy", strategy);
        payload.put("sizeBytes", cachedFile.length());
        return payload;
    }

    private boolean canAccessInstallTimeAssets() {
        if (canListDirectory(getContext(), FULL_SET_DIR)) return true;
        Context packageContext = resolvePackageContext();
        return packageContext != null && canListDirectory(packageContext, FULL_SET_DIR);
    }

    private boolean isReadablePackLocation(AssetPackLocation location) {
        if (location == null) return false;
        if (isReadablePackAssetsPath(location.assetsPath())) return true;
        return isReadablePackRootPath(location.path());
    }

    private boolean isReadablePackAssetsPath(String assetsPath) {
        if (assetsPath == null || assetsPath.isEmpty()) return false;
        File fullSetDir = new File(assetsPath, FULL_SET_DIR);
        return fullSetDir.isDirectory();
    }

    private boolean isReadablePackRootPath(String packPath) {
        if (packPath == null || packPath.isEmpty()) return false;
        File assetsRoot = new File(packPath, "assets");
        File fullSetDir = new File(assetsRoot, FULL_SET_DIR);
        return fullSetDir.isDirectory();
    }

    private boolean canListDirectory(Context context, String relativeDir) {
        if (context == null) return false;
        try {
            AssetManager assets = context.getAssets();
            if (assets == null) return false;
            String[] entries = assets.list(relativeDir);
            return entries != null && entries.length > 0;
        } catch (IOException ignored) {
            return false;
        }
    }

    private Context resolvePackageContext() {
        try {
            return getContext().createPackageContext(getContext().getPackageName(), 0);
        } catch (PackageManager.NameNotFoundException error) {
            return null;
        }
    }

    private String normalizeAssetPath(String rawAssetPath) {
        String assetPath = rawAssetPath != null ? rawAssetPath.trim().replace('\\', '/') : "";
        while (assetPath.startsWith("./")) {
            assetPath = assetPath.substring(2);
        }
        if (!assetPath.startsWith(FULL_SET_ROOT)) return null;
        return assetPath;
    }

    private File getCachedAssetFile(String assetPath) {
        File cachedFile = new File(getCacheRootDir(), assetPath);
        try {
            String rootPath = getCacheRootDir().getCanonicalPath();
            String filePath = cachedFile.getCanonicalPath();
            if (!filePath.equals(rootPath) && !filePath.startsWith(rootPath + File.separator)) {
                Log.w(TAG, "Rejected asset path escaping the cache root: " + assetPath);
                return null;
            }
        } catch (IOException error) {
            Log.w(TAG, "Could not canonicalize asset path: " + assetPath, error);
            return null;
        }
        return cachedFile;
    }

    private File getCacheRootDir() {
        return new File(getContext().getCacheDir(), CACHE_ROOT + File.separator + getAppVersionKey());
    }

    private String getAppVersionKey() {
        try {
            PackageInfo packageInfo;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                packageInfo = getContext()
                    .getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), PackageManager.PackageInfoFlags.of(0));
            } else {
                packageInfo = getContext()
                    .getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0);
            }
            long versionCode = packageInfo.getLongVersionCode();
            return "vc" + versionCode;
        } catch (Exception ignored) {
            return "vc0";
        }
    }

    private void ensureParentDir(File file) {
        File parent = file != null ? file.getParentFile() : null;
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
    }

    private boolean copyFromPackAssetsPath(String assetPath, File targetFile) throws IOException {
        AssetPackLocation location = assetPackManager.getPackLocation(PACK_NAME);
        if (location == null) return false;

        if (location.assetsPath() != null) {
            File directFile = new File(location.assetsPath(), assetPath);
            if (copyFromFileIfPresent(directFile, targetFile)) return true;
        }
        if (location.path() != null) {
            File rootedFile = new File(new File(location.path(), "assets"), assetPath);
            if (copyFromFileIfPresent(rootedFile, targetFile)) return true;
        }
        return false;
    }

    private boolean copyFromPackageAssetManager(Context context, String assetPath, File targetFile) throws IOException {
        if (context == null) return false;
        AssetManager assets = context.getAssets();
        if (assets == null) return false;
        try (InputStream input = assets.open(assetPath)) {
            copyToFile(input, targetFile);
            return true;
        } catch (IOException error) {
            return false;
        }
    }

    private boolean copyFromAssetLocation(String assetPath, File targetFile) throws IOException {
        AssetLocation location;
        try {
            location = assetPackManager.getAssetLocation(PACK_NAME, assetPath);
        } catch (Exception error) {
            return false;
        }
        if (location == null || location.path() == null || location.path().isEmpty()) return false;

        long remaining = location.size();
        long offset = location.offset();
        try (FileInputStream input = new FileInputStream(location.path());
             FileOutputStream output = new FileOutputStream(targetFile, false)) {
            if (offset > 0) {
                input.getChannel().position(offset);
            }
            byte[] buffer = new byte[16 * 1024];
            while (remaining > 0) {
                int requested = (int) Math.min(buffer.length, remaining);
                int read = input.read(buffer, 0, requested);
                if (read == -1) break;
                output.write(buffer, 0, read);
                remaining -= read;
            }
        }
        return targetFile.isFile() && targetFile.length() > 0;
    }

    private boolean copyFromFileIfPresent(File sourceFile, File targetFile) throws IOException {
        if (sourceFile == null || !sourceFile.isFile()) return false;
        try (FileInputStream input = new FileInputStream(sourceFile)) {
            copyToFile(input, targetFile);
            return true;
        }
    }

    private void copyToFile(InputStream input, File targetFile) throws IOException {
        try (InputStream source = input; FileOutputStream output = new FileOutputStream(targetFile, false)) {
            byte[] buffer = new byte[16 * 1024];
            int read;
            while ((read = source.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
        }
    }

    private AssetPackState resolvePackState(AssetPackStates states) {
        if (states == null) return null;
        Map<String, AssetPackState> stateMap = states.packStates();
        return stateMap != null ? stateMap.get(PACK_NAME) : null;
    }

    private String mapStatus(int status) {
        switch (status) {
            case AssetPackStatus.PENDING:
                return "pending";
            case AssetPackStatus.DOWNLOADING:
                return "downloading";
            case AssetPackStatus.TRANSFERRING:
                return "transferring";
            case AssetPackStatus.COMPLETED:
                return "completed";
            case AssetPackStatus.FAILED:
                return "failed";
            case AssetPackStatus.CANCELED:
                return "canceled";
            case AssetPackStatus.WAITING_FOR_WIFI:
                return "waiting_for_wifi";
            case AssetPackStatus.NOT_INSTALLED:
                return "not_installed";
            case AssetPackStatus.REQUIRES_USER_CONFIRMATION:
                return "requires_user_confirmation";
            case AssetPackStatus.UNKNOWN:
            default:
                return "unknown";
        }
    }
}
