import { useEffect, type ReactNode } from 'react'
import { SCALE, mag } from '@/lib/desk/scale'
import { numberWord } from '@/lib/desk/words'
import PaperShell from '@/components/paper/PaperShell'
import ScaleTable from '@/components/paper/ScaleTable'
import LevelSquares from '@/components/paper/LevelSquares'

const q = SCALE.quake
const a = SCALE.air
const f = SCALE.fire

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 pt-6 sm:pt-8">
      <h2 className="m-0 font-mono font-normal text-[12px] tracking-[0.08em] uppercase pb-2.5 border-b border-ink">{title}</h2>
      {children}
    </section>
  )
}

function P({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[16px] sm:text-[17px] leading-[1.6]">{children}</p>
}

function Term({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div className="grid sm:grid-cols-[200px_minmax(0,1fr)] gap-1 sm:gap-4 py-2.5 border-b border-rule">
      <dt className="font-mono text-[12px] uppercase tracking-[0.05em] pt-0.5">{term}</dt>
      <dd className="m-0 text-[15px] sm:text-[16px] leading-[1.55]">{children}</dd>
    </div>
  )
}

function Source({ name, href, children }: { name: string; href: string; children: ReactNode }) {
  return (
    <li className="py-2.5 border-b border-rule text-[15px] sm:text-[16px] leading-[1.55]">
      <a href={href} target="_blank" rel="noreferrer" className="font-semibold border-b border-ink hover:text-accent hover:border-accent">
        {name}
      </a>
      : {children}
    </li>
  )
}

const pop = f.level4MinPopulation.toLocaleString('en-IN')

/** About: how levels are set, what the labels mean, when reports come out, sources and credits. */
export default function About() {
  useEffect(() => {
    document.title = 'Sentinel · About'
  }, [])
  return (
    <PaperShell>
      <main className="max-w-[820px] pb-4">
        <section className="py-8 sm:py-11 border-b border-ink flex flex-col gap-4">
          <h1 className="m-0 font-cond font-semibold text-[32px] sm:text-[50px] leading-[1.04] tracking-[-0.01em]">About Sentinel</h1>
          <p className="m-0 text-[18px] sm:text-[20px] leading-[1.55]">
            Sentinel is a plain-language report on natural hazards in India: fires, air pollution, earthquakes, floods and cyclones. Three
            times a day it reads public data from satellites, monitoring networks and global disaster services, and writes it up as a
            numbered report. Every report stays readable as it was published.
          </p>
        </section>

        <Section title="How levels are set">
          <P>
            Every item gets a level from 1 to 4: minor, elevated, high or severe. The report ranks items by level, so a severe item always
            sits above a long list of minor ones. At the same level, cyclones come first, then floods, earthquakes, air and fires.
          </P>
          <ScaleTable names />
          <dl className="m-0">
            <Term term="Fires">
              NASA's fire satellites spot the heat of fires as they pass over India. Sentinel groups nearby detections into fires and counts
              them per state for each full day, then compares the count with the same time of year in {f.baselineYears}. Twice the usual count
              is Level 2, {numberWord(f.level3MinRatio)} times is Level 3, and so is a forest-fire alert from the global disaster monitors. A
              large fire within {f.level4NearKm} km of a town of {pop} people or more is Level 4. Fewer than {f.minFireEvents} fires in a day
              are too few to compare.
              {f.calibrationCap < 4 && (
                <>
                  {' '}
                  For now, levels from satellite counts stop at Level {f.calibrationCap}, until we've checked live counts against past years; a
                  dashed square shows the level a held state would have. Fire states are reported together in one story, unless a state reaches
                  Level 3 or is the only one.
                </>
              )}
            </Term>
            <Term term="Air">
              India's air quality index, from the Central Pollution Control Board's live feed. A city is poor from {a.aqi.poorAbove + 1} (Level
              1) and very poor from {a.aqi.veryPoorAbove + 1} (Level 2). One city in the severe band, from {a.aqi.severeAbove + 1}, is Level 3;{' '}
              {numberWord(a.level4MinSevereCities)} or more is Level 4. Because the readings are provisional, a city counts as
              severe only after {numberWord(a.severeConfirmRuns)} reports in a row. When the board's feed is down, Sentinel estimates the bands
              from public monitors on OpenAQ instead.
            </Term>
            <Term term="Earthquakes">
              From the US Geological Survey: quakes within {q.indiaBufferKm} km of India, and quakes of magnitude {mag(q.anywhereMinMagnitude)}{' '}
              or more farther out in the region. Under magnitude {mag(q.level2MinMagnitude)} is Level 1; {mag(q.level2MinMagnitude)} to{' '}
              {mag(q.level3MinMagnitude - 0.1)} is Level 2; {mag(q.level3MinMagnitude)} to {mag(q.level4MinMagnitude - 0.1)} is Level 3;{' '}
              {mag(q.level4MinMagnitude)} or more is Level 4. A quake leaves the report two days after it struck.
            </Term>
            <Term term="Floods and cyclones">
              From the global disaster monitors (GDACS, run by the United Nations and the European Commission). Their alert colour sets the
              level: green is Level 1, green with a rising alert is Level 2, orange is Level 3 and red is Level 4. An item leaves the report
              when the monitors close the event.
            </Term>
          </dl>
        </Section>

        <Section title="What the labels mean">
          <dl className="m-0">
            <Term term="Provisional">Live readings from the pollution control board, before the board's own checks.</Term>
            <Term term="Estimate">Sentinel's estimate from public monitors, used when the board's live feed is down. Not an official reading.</Term>
            <Term term="Held at Level 2">
              A fire level from satellite counts that would be higher. The squares show it:{' '}
              <span className="inline-block align-middle">
                <LevelSquares level={2} wouldBe={3} />
              </span>{' '}
              is held at 2 and would be 3.
            </Term>
            <Term term="Last known">A source didn't answer when the report was made, so these are the last figures we had.</Term>
            <Term term="New, back, up, down">
              Compared with the report about a day earlier: an item that wasn't on it, one that returned, or one whose level went up or down.
            </Term>
          </dl>
        </Section>

        <Section title="When reports come out">
          <P>
            At 02:30, 14:30 and 20:30 IST, from a Raspberry Pi. Fire counts are for the last full day of satellite passes, so the 02:30 report
            usually describes the day before yesterday, and the later two describe yesterday. "Since yesterday" compares each report with the one
            about a day earlier. Every report keeps its number, and the archive shows it as it was published.
          </P>
        </Section>

        <Section title="Not an alert system">
          <P>
            Sentinel is an independent summary of public data, not an official warning service. It can be hours behind, and its sources can
            fail. For warnings and what to do, follow the India Meteorological Department, the National Disaster Management Authority, the
            Central Pollution Control Board and your state and district authorities.
          </P>
        </Section>

        <Section title="Sources and credits">
          <ul className="m-0 p-0 list-none">
            <Source name="NASA FIRMS" href="https://firms.modaps.eosdis.nasa.gov/">
              fire detections from the VIIRS instrument on NOAA-20, live and from the 2024–2025 archive behind the seasonal baseline. We
              acknowledge the use of data and imagery from LANCE FIRMS operated by NASA's Earth Science Data and Information System (ESDIS) with
              funding provided by NASA Headquarters.
            </Source>
            <Source name="CPCB via data.gov.in" href="https://data.gov.in/resource/real-time-air-quality-index-various-locations">
              real-time air quality index, Central Pollution Control Board, under the Government Open Data License – India.
            </Source>
            <Source name="OpenAQ" href="https://openaq.org/">
              air quality readings from CPCB and AirNow monitors, used when the board's feed is down.
            </Source>
            <Source name="USGS" href="https://earthquake.usgs.gov/">
              earthquakes, from the US Geological Survey.
            </Source>
            <Source name="GDACS" href="https://www.gdacs.org/">
              flood, cyclone and forest-fire alerts from the Global Disaster Alert and Coordination System.
            </Source>
            <Source name="NASA EONET" href="https://eonet.gsfc.nasa.gov/">
              natural events tracked by NASA's Earth Observatory.
            </Source>
            <Source name="geoBoundaries" href="https://www.geoboundaries.org/">
              India's outline and district boundaries (source: LGD via Pathways Data), under ODbL 1.0.
            </Source>
            <Source name="DataMeet" href="https://github.com/datameet/maps">
              state boundaries from the Election Commission of India, under CC BY 2.5 IN.
            </Source>
            <Source name="GeoNames" href="https://www.geonames.org/">
              towns and cities, under CC BY 4.0.
            </Source>
          </ul>
        </Section>
      </main>
    </PaperShell>
  )
}
