import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import RaceCalendar from './components/RaceCalendar';
import LiveDashboard from './components/LiveDashboard';
import DriverStandings from './components/DriverStandings';
import AdminPanel from './components/AdminPanel';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-white">
        <nav className="border-b border-gray-800 px-6 py-4">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold text-red-500">PitWall</h1>
            <div className="flex gap-6 text-sm">
              <Link to="/" className="hover:text-red-400">Calendar</Link>
              <Link to="/live" className="hover:text-red-400">Live</Link>
              <Link to="/standings" className="hover:text-red-400">Standings</Link>
              <Link to="/admin" className="hover:text-red-400">Admin</Link>
            </div>
          </div>
        </nav>
        <main className="p-6">
          <Routes>
            <Route path="/" element={<RaceCalendar />} />
            <Route path="/live" element={<LiveDashboard />} />
            <Route path="/standings" element={<DriverStandings />} />
            <Route path="/admin" element={<AdminPanel />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
