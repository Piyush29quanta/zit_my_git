import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import {diffLines} from "diff"
import chalk from "chalk";

class Zit {  
  /**
   * Initializes a new instance of the Zit class.
   * Sets up repository-related paths based on the provided or default repository path.
   *
   * @param {string} [repoPath="."] - The base path to the repository. Defaults to the current directory.
   *
   * The following properties are set:
   * @property {string} repoPath - The path to the .zit directory within the repository.
   * @property {string} objectsPath - The path to the objects directory within the .zit directory.
   * @property {string} headPath - The path to the HEAD file within the .zit directory.
   * @property {string} indexPath - The path to the index file within the .zit directory.
   *
   */
  constructor(repoPath = ".") {
    this.repoPath = path.join(repoPath, ".zit"); 
    this.objectsPath = path.join(this.repoPath, "objects");
    this.headPath = path.join(this.repoPath, "HEAD");
    this.indexPath = path.join(this.repoPath, "index");
  }

  /**
   * Initializes a new Zit repository by creating the necessary directory structure
   * and files (.zit/objects, .zit/HEAD, .zit/index) if they do not already exist.
   * If the repository is already initialized, a message is logged.
   */
  async init() {
    await fs.mkdir(this.objectsPath, { recursive: true });

    try {
      await fs.writeFile(this.headPath, "", { flag: "wx" });
      await fs.writeFile(this.indexPath, JSON.stringify([]), { flag: "wx" });
    } catch (error) {
      console.log("Already initialized .zit folder");
    }
  }

  hashObject(content) { //creates thes hashobject using sha1 and returns hex
    return crypto.createHash("sha1").update(content, "utf-8").digest("hex");
  }

  async add(fileToBeAdded) {
    await fs.mkdir(this.objectsPath, { recursive: true });

    const fileData = await fs.readFile(fileToBeAdded, { encoding: "utf8" }); //takes the content of filetoBeAdded   
    const fileHash = this.hashObject(fileData);

    const objectPath = path.join(this.objectsPath, fileHash); //cretes a path where file name is the hash created

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

    console.log(`\nCommit: ${commitHash}`);
    console.log("Changes:\n");

    for (const file of commitData.files) {
      console.log(chalk.yellow(`--- ${file.path} ---`));
      
      const fileContent = await this.getFileContent(file.hash);
      
      if (!fileContent) {
        console.log(chalk.red("Error reading file content"));
        continue;
      }

      if(commitData.parent){
        const parentCommitData = await this.getCommitData(commitData.parent);
        
        if (!parentCommitData) {
          console.log(chalk.red("Error reading parent commit"));
          continue;
        }
        
        const parentFileContent = await this.getParentFileContent(parentCommitData, file.path);

        if(parentFileContent !== undefined){
          const diff = diffLines(parentFileContent, fileContent);
          
          diff.forEach(part => {
            if(part.added){
              const lines = part.value.split('\n');
              lines.forEach(line => {
                if (line.trim()) console.log(chalk.green(`+ ${line}`));
              });
            } else if(part.removed){
              const lines = part.value.split('\n');
              lines.forEach(line => {
                if (line.trim()) console.log(chalk.red(`- ${line}`));
              });
            } else {
              const lines = part.value.split('\n');
              lines.forEach(line => {
                if (line.trim()) console.log(chalk.gray(`  ${line}`));
              });
            }
          });
        } else {
          console.log(chalk.green("+ New file"));
          const lines = fileContent.split('\n');
          lines.forEach(line => {
            if (line.trim()) console.log(chalk.green(`+ ${line}`));
          });
        }
      } else {
        console.log(chalk.green("+ Initial commit"));
        const lines = fileContent.split('\n');
        lines.forEach(line => {
          if (line.trim()) console.log(chalk.green(`+ ${line}`));
        });
      }
      console.log(); // Add spacing between files
    }
  }

  async getParentFileContent(parentCommitData, filePath){
          const parentFile = parentCommitData.files.find(f => f.path === filePath);

          if(parentFile){
            return await this.getFileContent(parentFile.hash); // Fixed: was parent.fileHash
          }
          return undefined; // Added explicit return for clarity
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

  async getFileContent(fileHash){
    const filePath = path.join(this.objectsPath, fileHash);
    
    try {
      const data = await fs.readFile(filePath, { encoding: "utf8" });
      return data;
    } catch (error) {
      console.log("Failed to read file content", error);
      return null;
    }
  }
}

export default Zit;
