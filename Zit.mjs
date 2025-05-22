import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

class Zit {
  constructor(repoPath = ".") {
    this.repoPath = path.join(repoPath, ".zit");
    this.objectsPath = path.join(this.repoPath, "objects");
    this.headPath = path.join(this.repoPath, "HEAD");
    this.indexPath = path.join(this.repoPath, "index");
  }

  async init() {
    await fs.mkdir(this.objectsPath, { recursive: true });

    try {
      await fs.writeFile(this.headPath, "", { flag: "wx" });
      await fs.writeFile(this.indexPath, JSON.stringify([]), { flag: "wx" });
    } catch (error) {
      console.log("Already initialized .zit folder");
    }
  }

  hashObject(content) {
    return crypto.createHash("sha1").update(content, "utf-8").digest("hex");
  }

  async add(fileToBeAdded) {
    await fs.mkdir(this.objectsPath, { recursive: true });

    const fileData = await fs.readFile(fileToBeAdded, { encoding: "utf8" });
    const fileHash = this.hashObject(fileData);

    const objectPath = path.join(this.objectsPath, fileHash);

    // Avoid rewriting if already stored
    try {
      await fs.access(objectPath);
    } catch {
      await fs.writeFile(objectPath, fileData);
    }

    // Update staging area
    await this.updateStagingArea(fileToBeAdded, fileHash);

    console.log(`Added ${fileToBeAdded}`);
  }

  async updateStagingArea(filePath, fileHash) {
    const index = JSON.parse(await fs.readFile(this.indexPath, { encoding: "utf-8" }));

    const existingIndex = index.findIndex(entry => entry.path === filePath);
    if (existingIndex !== -1) {
      index[existingIndex].hash = fileHash;
    } else {
      index.push({ path: filePath, hash: fileHash });
    }

    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
  }

  async commit(message) {
    const index = JSON.parse(await fs.readFile(this.indexPath, { encoding: "utf8" }));
    const parentCommit = await this.getCurrentHead();

    const commitData = {
      timeStamp: new Date().toISOString(),
      message,
      files: index,
      parent: parentCommit
    };

    const commitHash = this.hashObject(JSON.stringify(commitData));
    const commitPath = path.join(this.objectsPath, commitHash);

    await fs.writeFile(commitPath, JSON.stringify(commitData, null, 2));
    await fs.writeFile(this.headPath, commitHash);
    await fs.writeFile(this.indexPath, JSON.stringify([]));

    console.log(`Commit successfully created: ${commitHash}`);
  }

  async getCurrentHead() {
    try {
      const content = await fs.readFile(this.headPath, { encoding: "utf8" });
      return content.trim() || null;
    } catch (error) {
      return null;
    }
  }

  async log() {
    let currentCommitHash = await this.getCurrentHead();

    while (currentCommitHash) {
      const commitData = await this.getCommitData(currentCommitHash);

      if (!commitData) break;

      console.log("------------------------------------------------------------------");
      console.log(`Commit: ${currentCommitHash}`);
      console.log(`Date: ${commitData.timeStamp}`);
      console.log(`\n${commitData.message}\n`);

      currentCommitHash = commitData.parent;
    }
  }

  async showCommitDiff(commitHash) {
    const commitData = await this.getCommitData(commitHash);

    if (!commitData) {
      console.log("Commit not found");
      return;
    }

    console.log("Changes in the last commit are:");

    for (const file of commitData.files) {
      console.log(`File: ${file.path}`);
    }
  }

  async getCommitData(commitHash) {
    const commitPath = path.join(this.objectsPath, commitHash);

    try {
      const data = await fs.readFile(commitPath, { encoding: "utf8" });
      return JSON.parse(data);
    } catch (error) {
      console.log("Failed to read the commit data", error);
      return null;
    }
  }
}

export default Zit;
