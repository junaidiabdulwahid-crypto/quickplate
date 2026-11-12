"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest, DEMO_LOCATION, type NearbyRestaurant } from "../lib/api";

/** Home: open restaurants within 5 km of the delivery spot. */
export default function HomePage() {
  const [list, setList] = useState<NearbyRestaurant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<NearbyRestaurant[]>(`/restaurants/nearby?lat=${DEMO_LOCATION.latitude}&lng=${DEMO_LOCATION.longitude}`)
      .then(setList)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main>
      <h1>Hungry?</h1>
      <p className="muted">Open restaurants that deliver to you, nearest first.</p>
      {error && <p className="error">{error}</p>}
      {list === null && !error && <p className="muted">Loading…</p>}
      {list?.length === 0 && <p className="muted">No open restaurants nearby right now.</p>}
      {list?.map((r) => (
        <div key={r.id} className="card">
          <Link href={`/restaurants/${r.id}`} className="row">
            <span><strong>{r.name}</strong> <span className="pill">{r.cuisine}</span></span>
            <span className="muted">{(r.distance_m / 1000).toFixed(1)} km</span>
          </Link>
        </div>
      ))}
    </main>
  );
}
