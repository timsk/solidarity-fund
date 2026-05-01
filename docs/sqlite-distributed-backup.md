# SQLite Distributed Backup

Setup guide for volunteer-distributed resilient backups.

## Overview

This guide covers how to set up a resilient SQLite backup system where volunteers hold encrypted copies of a database they cannot read, enabling the organisation to recover from server loss using any volunteer's copy.

The key components are:

- WAL checkpoint on the server to make the live DB safe to copy
- Syncthing with encrypted folders to distribute backups to volunteers
- A restore procedure the organisation can follow if the server is lost

---

## Part 1: Configure the Database

### Enable WAL Mode

WAL (Write-Ahead Log) mode makes SQLite safe to read while writes are in progress. Enable it once:

```bash
sqlite3 /var/app/mydb.sqlite "PRAGMA journal_mode=WAL;"
```

In WAL mode, SQLite maintains three files:

- `mydb.sqlite` — the main database file
- `mydb.sqlite-wal` — write-ahead log (may contain uncommitted data)
- `mydb.sqlite-shm` — shared memory index

Syncthing cannot sync all three atomically, so we periodically checkpoint to collapse the WAL back into the main file, making it self-consistent and safe to distribute as a single file.

### Checkpoint Script

Create the following script on the server:

```bash
# /usr/local/bin/sqlite-checkpoint.sh
#!/bin/bash
set -euo pipefail
sqlite3 /var/app/mydb.sqlite "PRAGMA wal_checkpoint(TRUNCATE);"
echo "Checkpoint complete: $(date)"
```

```bash
chmod +x /usr/local/bin/sqlite-checkpoint.sh
```

Schedule it every 15 minutes via cron:

```bash
crontab -e
# Add:
*/15 * * * * /usr/local/bin/sqlite-checkpoint.sh >> /var/log/sqlite-checkpoint.log 2>&1
```

After each checkpoint, the `.sqlite` file is fully self-consistent and safe for Syncthing to pick up and distribute.

---

## Part 2: Install and Configure Syncthing

### Install on the Server

```bash
# Debian/Ubuntu
sudo apt install syncthing

# Run as a service (replace 'appuser' with your service account)
sudo systemctl enable syncthing@appuser
sudo systemctl start syncthing@appuser
```

Access the Syncthing web UI by SSH-tunnelling from your local machine:

```bash
ssh -L 8384:localhost:8384 user@myserver.example.com
# Then open http://localhost:8384 in your browser
```

### Configure the Shared Folder

In the Syncthing web UI on the server:

1. Click **Add Folder**
2. Set the folder path to the directory containing your `.sqlite` file (e.g. `/var/app/`)
3. Note down the server's **Device ID** (Actions → Show ID)

### Add Volunteers

For each volunteer:

1. They install Syncthing on their machine (see below)
2. They share their **Device ID** with the organisation
3. In the server web UI: **Add Device** → paste their Device ID
4. Share the folder with them, ticking **Encrypted**
5. Set a strong encryption password — store this securely (e.g. org password manager)

> Volunteers will see a folder of unreadable encrypted blobs. This is correct and expected — they cannot access the data.

### Volunteer Setup

Volunteers install the Syncthing GUI app for their platform:

- **Windows**: [SyncTrayzor](https://github.com/canton7/SyncTrayzor) (friendliest option)
- **macOS**: Syncthing for macOS from [syncthing.net/downloads](https://syncthing.net/downloads)
- **Linux**: `sudo apt install syncthing`

Once installed, the volunteer shares their Device ID with the organisation. The encrypted folder syncs automatically after the server adds them. Syncthing handles NAT traversal automatically — no special network configuration needed.

---

## Part 3: Restore Procedure

If the server is lost, any volunteer can provide their backup folder for recovery.

### Step 1: Retrieve the Backup

Ask a volunteer to share their Syncthing backup folder (zip it and send via a secure channel, or pull via SCP):

```bash
scp -r volunteer@their-ip:/path/to/syncthing/folder ./recovered-backups
```

### Step 2: Decrypt

Decrypt using the Syncthing CLI and the organisation's encryption password:

```bash
syncthing decrypt \
  --password=<encryption-password> \
  --folder-path ./recovered-backups \
  --to ./decrypted-backups
```

### Step 3: Verify and Restore

```bash
# Verify integrity
sqlite3 ./decrypted-backups/mydb.sqlite "PRAGMA integrity_check;"
# Should output: ok

# Restore to new server
cp ./decrypted-backups/mydb.sqlite /var/app/mydb.sqlite
```

---

## Security Notes

- The **encryption password** is the single most critical secret. Store it in the organisation's password manager, not just with one person.
- Volunteers hold encrypted data they cannot read — they do not need to be trusted with the password.
- Rotate the encryption password and re-share the folder if a volunteer leaves.
- Periodically verify that at least one volunteer's copy can be successfully decrypted and restored.
