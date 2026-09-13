'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Trash2, Clock, Power } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

interface PickupSlot {
  id?: string;
  start: string;
  end: string;
  maxOrders: number;
}

interface StoreHoursData {
  operatingHours: {
    MON: DayHours;
    TUE: DayHours;
    WED: DayHours;
    THU: DayHours;
    FRI: DayHours;
    SAT: DayHours;
    SUN: DayHours;
  };
  isOpen: boolean;
  pickupSlots: PickupSlot[];
}

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_NAMES: { [key: string]: string } = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

export default function StoreHoursPage() {
  const params = useParams();
  const orgId = params.orgId as string;

  const [storeId, setStoreId] = useState<string>('');
  const [data, setData] = useState<StoreHoursData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [newSlot, setNewSlot] = useState<PickupSlot>({ start: '11:00', end: '13:00', maxOrders: 10 });
  const [showNewSlotForm, setShowNewSlotForm] = useState(false);

  useEffect(() => {
    if (orgId) {
      fetchStore();
    }
  }, [orgId]);

  useEffect(() => {
    if (storeId) {
      fetchHours();
    }
  }, [storeId]);

  const fetchStore = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/stores/${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setStoreId(data.store?.id || data.id);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching store:', error);
      setLoading(false);
    }
  }

  const fetchHours = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/store-hours/${storeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        if (response.status === 404) {
          setData({
            operatingHours: {
              MON: { open: '09:00', close: '22:00', closed: false },
              TUE: { open: '09:00', close: '22:00', closed: false },
              WED: { open: '09:00', close: '22:00', closed: false },
              THU: { open: '09:00', close: '22:00', closed: false },
              FRI: { open: '09:00', close: '23:00', closed: false },
              SAT: { open: '10:00', close: '23:00', closed: false },
              SUN: { open: '10:00', close: '22:00', closed: false },
            },
            isOpen: true,
            pickupSlots: [],
          });
        }
        return;
      }

      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Error fetching store hours:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDay = async (day: string, hours: DayHours) => {
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/store-hours/${storeId}/day/${day}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(hours),
      });

      if (response.ok) {
        await fetchHours();
        setEditingDay(null);
      }
    } catch (error) {
      console.error('Error updating day:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStoreStatus = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/store-hours/${storeId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isOpen: !data.isOpen }),
      });

      if (response.ok) {
        await fetchHours();
      }
    } catch (error) {
      console.error('Error toggling store status:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAddPickupSlot = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/store-hours/${storeId}/pickup-slots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newSlot),
      });

      if (response.ok) {
        await fetchHours();
        setNewSlot({ start: '11:00', end: '13:00', maxOrders: 10 });
        setShowNewSlotForm(false);
      }
    } catch (error) {
      console.error('Error adding pickup slot:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePickupSlot = async (slotId: string | undefined) => {
    if (!slotId) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/store-hours/${storeId}/pickup-slots/${slotId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        await fetchHours();
      }
    } catch (error) {
      console.error('Error deleting pickup slot:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <div className="max-w-2xl mx-auto text-center text-slate-400">
          <p>Store hours data not available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header with Store Status */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Clock className="text-amber-500" />
              Store Hours & Availability
            </h1>
          </div>
          <button
            onClick={handleToggleStoreStatus}
            disabled={saving}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
              data.isOpen
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-red-600 text-white hover:bg-red-700'
            } disabled:opacity-50`}
          >
            <Power size={20} />
            {data.isOpen ? 'Open' : 'Closed'}
          </button>
        </div>

        {/* Operating Hours Section */}
        <div className="bg-slate-800 rounded-lg p-6 mb-8 border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-6">Operating Hours</h2>
          <div className="space-y-3">
            {DAYS.map((day) => {
              const hours = data.operatingHours[day as keyof typeof data.operatingHours];
              const isEditing = editingDay === day;

              return (
                <div
                  key={day}
                  className="flex items-center justify-between bg-slate-700 p-4 rounded-lg border border-slate-600"
                >
                  <div className="flex-1">
                    <p className="text-white font-medium">{DAY_NAMES[day]}</p>
                  </div>

                  {!isEditing ? (
                    <div className="flex items-center gap-4">
                      <div className={`text-sm ${hours.closed ? 'text-red-400' : 'text-green-400'}`}>
                        {hours.closed ? 'CLOSED' : `${hours.open} - ${hours.close}`}
                      </div>
                      <button
                        onClick={() => setEditingDay(day)}
                        className="px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 transition text-sm"
                      >
                        Edit
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-slate-300">
                        <input
                          type="checkbox"
                          checked={hours.closed}
                          onChange={(e) => {
                            const updated = { ...hours, closed: e.target.checked };
                            handleUpdateDay(day, updated);
                          }}
                          className="w-4 h-4"
                        />
                        Closed
                      </label>
                      {!hours.closed && (
                        <>
                          <input
                            type="time"
                            value={hours.open}
                            onChange={(e) => {
                              const updated = { ...hours, open: e.target.value };
                              setData({
                                ...data,
                                operatingHours: {
                                  ...data.operatingHours,
                                  [day]: updated,
                                },
                              });
                            }}
                            className="px-2 py-1 bg-slate-600 text-white rounded text-sm"
                          />
                          <span className="text-slate-400">to</span>
                          <input
                            type="time"
                            value={hours.close}
                            onChange={(e) => {
                              const updated = { ...hours, close: e.target.value };
                              setData({
                                ...data,
                                operatingHours: {
                                  ...data.operatingHours,
                                  [day]: updated,
                                },
                              });
                            }}
                            className="px-2 py-1 bg-slate-600 text-white rounded text-sm"
                          />
                        </>
                      )}
                      <button
                        onClick={() => handleUpdateDay(day, hours)}
                        disabled={saving}
                        className="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition text-sm disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingDay(null)}
                        className="px-2 py-1 bg-slate-600 text-white rounded hover:bg-slate-500 transition text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pickup Time Slots Section */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Pickup Time Slots</h2>
            {!showNewSlotForm && (
              <button
                onClick={() => setShowNewSlotForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
              >
                <Plus size={20} />
                Add Slot
              </button>
            )}
          </div>

          {/* Add Slot Form */}
          {showNewSlotForm && (
            <div className="bg-slate-700 p-4 rounded-lg mb-4 border border-slate-600">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="text-slate-300 text-sm">Start Time</label>
                  <input
                    type="time"
                    value={newSlot.start}
                    onChange={(e) => setNewSlot({ ...newSlot, start: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-600 text-white rounded text-sm"
                  />
                </div>
                <div>
                  <label className="text-slate-300 text-sm">End Time</label>
                  <input
                    type="time"
                    value={newSlot.end}
                    onChange={(e) => setNewSlot({ ...newSlot, end: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-600 text-white rounded text-sm"
                  />
                </div>
                <div>
                  <label className="text-slate-300 text-sm">Max Orders</label>
                  <input
                    type="number"
                    min="1"
                    value={newSlot.maxOrders}
                    onChange={(e) => setNewSlot({ ...newSlot, maxOrders: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-600 text-white rounded text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddPickupSlot}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  onClick={() => setShowNewSlotForm(false)}
                  className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-500 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Slots List */}
          {data.pickupSlots.length > 0 ? (
            <div className="space-y-3">
              {data.pickupSlots.map((slot) => (
                <div
                  key={slot.id}
                  className="flex items-center justify-between bg-slate-700 p-4 rounded-lg border border-slate-600"
                >
                  <div className="flex-1">
                    <p className="text-white font-medium">
                      {slot.start} - {slot.end}
                    </p>
                    <p className="text-slate-400 text-sm">Max {slot.maxOrders} orders</p>
                  </div>
                  <button
                    onClick={() => handleDeletePickupSlot(slot.id)}
                    disabled={saving}
                    className="p-2 bg-red-600 text-white rounded hover:bg-red-700 transition disabled:opacity-50"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-8">No pickup slots configured</p>
          )}
        </div>
      </div>
    </div>
  );
}
