import { describe, it, expect } from 'vitest';
import { ProceduralCommsDirector, type CommsParticipant } from '../src/narrative/ProceduralCommsDirector';

describe('ProceduralCommsDirector', () => {
  const director = ProceduralCommsDirector.getInstance();

  const miningStation: CommsParticipant = {
    id: 'station-mining-1',
    name: 'Hadley Refineries',
    entityKind: 'STATION',
    archetype: 'MINING_REFINERY',
    faction: 'Belt Prospectors Union',
  };

  const researchArray: CommsParticipant = {
    id: 'station-research-1',
    name: 'Aether Deep Horizon',
    entityKind: 'STATION',
    archetype: 'RESEARCH_ARRAY',
    faction: 'Outer Stellar Consortium',
  };

  const navalFlagship: CommsParticipant = {
    id: 'vessel-flagship-1',
    name: 'Aegis of Sol',
    entityKind: 'VESSEL',
    sizeClass: 'CAPITAL',
    captainName: 'Admiral Valen',
    faction: 'Syndicate Defense Fleet',
  };

  const tradeHauler: CommsParticipant = {
    id: 'vessel-trader-1',
    name: 'Silver Nomad',
    entityKind: 'VESSEL',
    archetype: 'INDUSTRIAL_HAULER',
    sizeClass: 'TRADER',
    captainName: 'Trader Jax',
    faction: 'Free Trader Cartel',
  };

  it('determines personality accurately based on archetype and sizeClass', () => {
    expect(director.determinePersonality(miningStation)).toBe('VETERAN_MINER');
    expect(director.determinePersonality(researchArray)).toBe('COSMIC_SCHOLAR');
    expect(director.determinePersonality(navalFlagship)).toBe('NAVAL_COMMANDER');
    expect(director.determinePersonality(tradeHauler)).toBe('VETERAN_MINER'); // INDUSTRIAL_HAULER
  });

  it('generates distinct greetings for initial vs repeat visits', () => {
    const firstGreeting = director.generateGreeting(miningStation, 0);
    expect(firstGreeting.speaker).toContain('HADLEY REFINERIES');
    expect(firstGreeting.text.length).toBeGreaterThan(15);

    const repeatGreeting = director.generateGreeting(miningStation, 1);
    expect(repeatGreeting.speaker).toContain('HADLEY REFINERIES');
    expect(repeatGreeting.text.length).toBeGreaterThan(15);
    // Repeat greeting recognizes returning pilot
    expect(repeatGreeting.text).not.toBe(firstGreeting.text);
  });

  it('cycles through multi-tier chronicles on repeat customs_lore inquiries', () => {
    const tier1 = director.generateResponse({
      target: researchArray,
      queryType: 'customs_lore',
      inquiryCount: 0,
    });

    const tier2 = director.generateResponse({
      target: researchArray,
      queryType: 'customs_lore',
      inquiryCount: 1,
    });

    const tier3 = director.generateResponse({
      target: researchArray,
      queryType: 'customs_lore',
      inquiryCount: 2,
    });

    expect(tier1.replyText.length).toBeGreaterThan(20);
    expect(tier2.replyText).toContain('[ARCHIVE CHRONICLE II]');
    expect(tier3.replyText).toContain('[ARCHIVE CHRONICLE III — DEEP SPACE MEMOIRS]');
    expect(tier1.replyText).not.toBe(tier2.replyText);
    expect(tier2.replyText).not.toBe(tier3.replyText);
  });

  it('generates varied responses across all 5 query types', () => {
    const queryTypes = [
      'traffic_advisory',
      'trade_routes',
      'customs_lore',
      'auxiliary_support',
      'deep_space_rumors',
    ] as const;

    for (const qt of queryTypes) {
      const res = director.generateResponse({
        target: navalFlagship,
        systemName: 'Kepler Prime',
        queryType: qt,
        inquiryCount: 0,
      });

      expect(res.pilotText.length).toBeGreaterThan(10);
      expect(res.replyText.length).toBeGreaterThan(15);
      expect(res.speaker).toContain('ADMIRAL VALEN');
    }
  });

  it('guarantees deterministic output for the same entity and query index', () => {
    const resA = director.generateResponse({
      target: tradeHauler,
      queryType: 'deep_space_rumors',
      inquiryCount: 3,
    });

    const resB = director.generateResponse({
      target: tradeHauler,
      queryType: 'deep_space_rumors',
      inquiryCount: 3,
    });

    expect(resA.replyText).toBe(resB.replyText);
    expect(resA.pilotText).toBe(resB.pilotText);
  });
});
