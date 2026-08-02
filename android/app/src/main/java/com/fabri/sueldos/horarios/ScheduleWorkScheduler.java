package com.fabri.sueldos.horarios;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

public final class ScheduleWorkScheduler {
    public static final String NOTIFICATION_CHANNEL_ID = "schedule_updates";
    private static final String PERIODIC_WORK_NAME = "schedule_update_check";
    private static final String IMMEDIATE_WORK_NAME = "schedule_update_check_now";

    private ScheduleWorkScheduler() {
    }

    public static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Actualizaciones de horarios",
                NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Avisos cuando se detectan cambios en los horarios.");

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    public static void scheduleBackgroundChecks(Context context) {
        Context appContext = context.getApplicationContext();
        createNotificationChannel(appContext);

        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        PeriodicWorkRequest periodicRequest = new PeriodicWorkRequest.Builder(ScheduleCheckWorker.class, 30, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build();

        WorkManager.getInstance(appContext).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                periodicRequest
        );
    }

    public static void runImmediateCheck(Context context) {
        Context appContext = context.getApplicationContext();
        createNotificationChannel(appContext);

        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(ScheduleCheckWorker.class)
                .setConstraints(constraints)
                .build();

        WorkManager.getInstance(appContext).enqueueUniqueWork(
                IMMEDIATE_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request
        );
    }
}
