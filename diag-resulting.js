const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { MarketService } = require('./dist/market/market.service');

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const marketService = app.get(MarketService);

    console.log('--- MANUALLY TRIGGERING MARKET RESULTING ---');
    await marketService.checkAndResultMarkets();
    console.log('--- DONE ---');

    await app.close();
}

main().catch(err => {
    console.error('Fatal error during diagnostic:', err);
    process.exit(1);
});
