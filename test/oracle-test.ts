import { Logger } from '@nestjs/common';
import { OracleService } from '../src/scraper/oracle.service';
import { FlashscoreAdapter } from '../src/scraper/adapters/flashscore.adapter';
import { SofaScoreAdapter } from '../src/scraper/adapters/sofascore.adapter';
import { LiveScoreAdapter } from '../src/scraper/adapters/livescore.adapter';
import { BBCAdapter } from '../src/scraper/adapters/bbc.adapter';

async function run() {
  const logger = new Logger('TestRunner');
  logger.log('Initializing Adapters...');

  const flashscore = new FlashscoreAdapter();
  const sofascore = new SofaScoreAdapter();
  const livescore = new LiveScoreAdapter();
  const bbc = new BBCAdapter();

  const oracle = new OracleService(flashscore, sofascore, livescore, bbc);

  // Test Case: Real Madrid vs Barcelona (or a recent match likely to be found)
  // Let's use a very famous match or one that just happened.
  // "Real Madrid" "Barcelona" usually returns their last H2H or next fixture.
  // Ideally, we want a COMPLETED match for consensus.
  // "Man City" "Chelsea" ?
  const home = 'Real Madrid';
  const away = 'Barcelona';

  logger.log(`Running Consensus for ${home} vs ${away}...`);
  const result = await oracle.getConsensusResult(home, away);

  logger.log('Final Result:', JSON.stringify(result, null, 2));
}

run().catch((e) => console.error(e));
