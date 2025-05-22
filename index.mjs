import Zit from './Zit.mjs';

async function main() {
    const zit = new Zit();
    await zit.init();           
    await zit.add(); 
    await zit.commit()
    await zit.log();
}

main();