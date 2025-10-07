import { DAODistributor, RankifyDiamondInstance, RankToken } from '../../types';
import { task } from 'hardhat/config';
import inquirer from 'inquirer';
import { InstanceBase, GameState } from './InstanceBase';
import { MAOInstances, parseInstantiated } from '../../scripts/parseInstantiated';
import { BigNumber } from 'ethers';
import { setupMockedEnvironment, SignerIdentity } from '../../scripts/setupMockEnvironment';
import { log } from '../../scripts/utils';

type GameAction = 'openRegistration' | 'fillParty' | 'startGame' | 'nextMove' | 'lastMove' | 'overtime' | 'endGame';

const actionStateMap: Record<GameAction, GameState> = {
  openRegistration: GameState.Created,
  fillParty: GameState.RegistrationOpened,
  startGame: GameState.PartyFilled,
  nextMove: GameState.NextMove,
  lastMove: GameState.LastMove,
  overtime: GameState.Overtime,
  endGame: GameState.Ended,
};

async function getAvailableActions(gameState: GameState): Promise<string[]> {
  const allActions = ['openRegistration', 'fillParty', 'startGame', 'nextMove', 'lastMove', 'overtime', 'endGame'];

  const stateToIndex: Record<GameState, number> = {
    [GameState.Created]: 0,
    [GameState.RegistrationOpened]: 1,
    [GameState.PartyFilled]: 2,
    [GameState.Started]: 3,
    [GameState.NextMove]: 3, // Same as Started
    [GameState.LastMove]: 5,
    [GameState.Overtime]: 6,
    [GameState.Ended]: 7,
  };

  const index = stateToIndex[gameState];
  return index === undefined ? ['back to game selection'] : allActions.slice(index);
}

async function executeActionWithIntermediateSteps(
  instanceBase: InstanceBase,
  gameId: number,
  targetAction: string,
  currentState: GameState,
  players: [SignerIdentity, SignerIdentity, ...SignerIdentity[]],
) {
  // Execute single action and wait for state update
  async function executeAndWaitForState(action: GameAction) {
    console.log(`Executing step: ${action}`);
    await executeSingleAction(instanceBase, gameId, action, players);
    // Wait for state update and verify
    const newState = await instanceBase.getGameState(gameId);
    console.log(`State updated to: ${GameState[newState]}`);
  }

  // If the target action is the same as current state's action, just execute it
  if (actionStateMap[targetAction as GameAction] === currentState) {
    await executeAndWaitForState(targetAction as GameAction);
    return;
  }

  // For progression, execute only if state matches expectations
  switch (currentState) {
    case GameState.Created:
      await executeAndWaitForState('openRegistration');
      await executeActionWithIntermediateSteps(
        instanceBase,
        gameId,
        targetAction,
        await instanceBase.getGameState(gameId),
        players,
      );
      break;
    case GameState.RegistrationOpened:
      await executeAndWaitForState('fillParty');
      await executeActionWithIntermediateSteps(
        instanceBase,
        gameId,
        targetAction,
        await instanceBase.getGameState(gameId),
        players,
      );
      break;
    case GameState.PartyFilled:
      await executeAndWaitForState('startGame');
      await executeActionWithIntermediateSteps(
        instanceBase,
        gameId,
        targetAction,
        await instanceBase.getGameState(gameId),
        players,
      );
      break;
    case GameState.Started:
      if (targetAction === 'nextMove') {
        await executeAndWaitForState('nextMove');
        break;
      }
    // eslint-disable-next-line no-fallthrough
    case GameState.NextMove:
    case GameState.LastMove:
      if (targetAction === 'lastMove') {
        await executeAndWaitForState('lastMove');
        break;
      }
    // eslint-disable-next-line no-fallthrough
    case GameState.Overtime:
      await executeAndWaitForState('endGame');
      break;
    case GameState.Ended:
      break;
  }
}

async function executeSingleAction(
  instanceBase: InstanceBase,
  gameId: number,
  action: GameAction,
  players: [SignerIdentity, SignerIdentity, ...SignerIdentity[]],
) {
  switch (action) {
    case 'openRegistration':
      await instanceBase.openRegistration(gameId);
      console.log('Registration opened successfully');
      break;
    case 'fillParty':
      await instanceBase.fillParty({
        players,
        gameId,
        shiftTime: true,
        gameMaster: instanceBase.adr.gameMaster1,
        startGame: false,
      });
      console.log('Party filled successfully');
      break;
    case 'startGame':
      await instanceBase.startGame(gameId);
      console.log('Game started successfully');
      break;
    case 'nextMove':
      await instanceBase.makeTurn({
        gameId,
        distribution: 'equal',
        increaseFinalTime: false,
      });
      console.log('Next move completed');
      break;
    case 'lastMove':
      await instanceBase.runTillLastTurn(gameId);
      console.log('Last move completed');
      break;
    case 'overtime':
      await instanceBase.handleOvertime(gameId);
      console.log('Overtime handled');
      break;
    case 'endGame':
      await instanceBase.endGame(gameId);
      console.log('Game ended successfully');
      break;
  }
}

async function handleGameState(instanceBase: InstanceBase, gameId: number) {
  let continueGame = true;
  const players = instanceBase.getPlayers(instanceBase.adr, 5);

  while (continueGame) {
    const currentState = await instanceBase.getGameState(gameId);
    const availableActions = await getAvailableActions(currentState);

    const { action } = await inquirer.prompt({
      type: 'list',
      name: 'action',
      message: `Game ${gameId} (${GameState[currentState]}) - What would you like to do?`,
      choices: [...availableActions, 'back to game selection'],
    });

    if (action === 'back to game selection') {
      continueGame = false;
      continue;
    }

    try {
      await executeActionWithIntermediateSteps(instanceBase, gameId, action, currentState, players);
      if (action === 'endGame') {
        continueGame = false;
      }
    } catch (error) {
      console.error(`Error executing ${action}:`, error);
    }
  }
}

task('interactive', 'Interactive guide through the game lifecycle').setAction(async (_, hre) => {
  const setupEnv = await setupMockedEnvironment(hre, false, false);
  hre.tracer.enabled = true;
  const { ethers } = hre;
  // Initial setup
  const DAODistributor = await hre.deployments.get('DAODistributor');
  const distributorContract = new hre.ethers.Contract(
    DAODistributor.address,
    DAODistributor.abi,
    hre.ethers.provider,
  ) as DAODistributor;

  const dsitributions = await distributorContract.getDistributions();
  if (dsitributions.length > 0) {
    console.log('Distributor already has instances, skipping distribution creation');
  } else {
    await hre.run('addDistribution');
  }

  // Get all subjects
  const eventsFilter = await distributorContract.filters.Instantiated();
  const subjects = await distributorContract.queryFilter(eventsFilter).then(evts => {
    return evts.map(evt => {
      return {
        instances: evt.args.instances,
        newInstanceId: evt.args.newInstanceId,
        instancesParsed: parseInstantiated(evt.args.instances),
      };
    });
  });

  let exitProgram = false;
  while (!exitProgram) {
    const { action } = await inquirer.prompt({
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: ['Create new subject', 'Select existing subject', 'Change logs verbosity', 'List distributions', 'Exit'],
    });

    let instanceBase;
    let selectedSubject;
    switch (action) {
      case 'List distributions': {
        const distributions = await distributorContract.getDistributions();
        console.log(
          'Distributions:',
          distributions.map(dist => ethers.utils.parseBytes32String(dist)),
        );
        break;
      }
      case 'Create new subject': {
        const subject = (await hre.run('createSubject', {
          useFixture: false,
        })) as {
          instances: string[];
          newInstanceId: BigNumber;
          instancesParsed: MAOInstances;
        };
        console.log('Subject created with instances:', subject.instances);
        subjects.push(subject);
        break;
      }
      case 'Select existing subject': {
        if (subjects.length === 0) {
          console.log('No subjects found. Please create a new subject first.');
          continue;
        }
        const { subjectId } = await inquirer.prompt({
          type: 'list',
          name: 'subjectId',
          message: 'Select a subject:',
          choices: subjects.map(subject => ({
            name: `${subject.newInstanceId} (${subject.instancesParsed.ACIDInstance})`,
            value: subject.newInstanceId,
          })),
        });
        selectedSubject = subjects.find(subject => subject.newInstanceId === subjectId);
        break;
      }
      case 'Change logs verbosity': {
        const { verbosity } = await inquirer.prompt({
          type: 'list',
          name: 'verbosity',
          message: 'Select a verbosity level:',
          choices: ['none', 'low', 'medium', 'high'],
        });
        if (verbosity === 'none') {
          process.env['VERBOSE'] = '';
        } else {
          process.env['VERBOSE'] = 'true';
        }
        const mapping = {
          none: '0',
          low: '1',
          medium: '2',
          high: '3',
        };
        process.env['VERBOSE_LEVEL'] = mapping[verbosity as keyof typeof mapping];
        log(`Logs verbosity set to ${verbosity}`);
        break;
      }
      case 'Exit':
        exitProgram = true;
        continue;
    }

    if (selectedSubject) {
      instanceBase = new InstanceBase({
        env: setupEnv.env,
        adr: setupEnv.adr,
        rankifyInstance: (await ethers.getContractAt(
          'RankifyDiamondInstance',
          selectedSubject.instancesParsed.ACIDInstance,
        )) as RankifyDiamondInstance,
        rankToken: (await ethers.getContractAt('RankToken', selectedSubject.instancesParsed.rankToken)) as RankToken,
        hre,
      });

      let continueWithSubject = true;
      while (continueWithSubject) {
        const { subjectAction } = await inquirer.prompt({
          type: 'list',
          name: 'subjectAction',
          message: `Managing ${selectedSubject.newInstanceId.toString()} - What would you like to do?`,
          choices: ['Create new game', 'Select existing game', 'Back to subject selection', 'Exit'],
        });

        switch (subjectAction) {
          case 'Create new game': {
            const { metadata } = await inquirer.prompt({
              type: 'input',
              name: 'metadata',
              message: 'Enter metadata for the game:',
              default: 'test metadata',
            });
            const gameId = await instanceBase.createGame({
              minGameTime: instanceBase.RInstanceSettings().RInstance_MIN_GAME_TIME,
              signer: instanceBase.adr.gameCreator1.wallet,
              gameMaster: instanceBase.adr.gameMaster1.address,
              gameRank: 1,
              openNow: false,
              metadata: metadata,
            });
            console.log('Game created with ID:', gameId);
            const { manage } = await inquirer.prompt({
              type: 'confirm',
              name: 'manage',
              message: 'Would you like to manage this game now?',
            });
            if (manage) {
              await handleGameState(instanceBase, Number(gameId));
            }
            break;
          }
          case 'Select existing game': {
            const games = await instanceBase.getActiveGames();
            if (games.length === 0) {
              console.log('No active games found');
              continue;
            }
            const { gameId } = await inquirer.prompt({
              type: 'list',
              name: 'gameId',
              message: 'Select a game to manage:',
              choices: games.map(id => ({
                name: `Game ${id}`,
                value: id,
              })),
            });
            await handleGameState(instanceBase, Number(gameId));
            break;
          }
          case 'Back to subject selection':
            continueWithSubject = false;
            break;
          case 'Exit':
            continueWithSubject = false;
            exitProgram = true;
            break;
        }
      }
    }
  }
});
