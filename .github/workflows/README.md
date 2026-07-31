# Workflows

Empty on purpose.

## keep-render-awake.yml, removed 2026-07-31

It pinged `dubu-market-server.onrender.com/health` on a `3,13,23,33,43,53 * * * *` cron, because
Render free services sleep after 15 minutes without inbound traffic.

It did not work. Over 19 hours it ran 11 times instead of about 114:

```
gap between runs:  median 101.5 min,  shortest 69.4,  longest 224.9
gaps over the 15 minute sleep threshold:  10 of 10
```

Every run reported success, so the workflow was green the whole time the service was asleep.
Scheduled workflows are best effort and get coalesced hard on free runners; a 10 minute cron is a
request, not a guarantee, and it leaves no margin against a 15 minute timer.

The replacement is a systemd timer on the engine box, `ubuntu@162.19.94.9`:

```
systemctl list-timers render-keepalive.timer
journalctl -u render-keepalive.service -n 20
```

`OnUnitActiveSec=5min`, `AccuracySec=30s`, `Persistent=true`, hitting the same `/health`. It fires
when it says it will, because that box is already up for the market maker. `--fail` is on the curl
so a 5xx becomes a unit failure rather than a silent success.

Anything else that needs to run on a schedule should go there too, for the same reason.
