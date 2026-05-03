'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { RoomSchema, RoomFormData } from '@/lib/validation/data-management';
import { RoomRecord } from '@/lib/services/timetable/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ROOM_TYPES = ['Classroom', 'Lab', 'Lecture Hall', 'Tutorial Hall', 'Seminar Hall'];

interface RoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room?: RoomRecord | null;
  onSuccess?: () => void;
}

export function RoomDialog({ open, onOpenChange, room, onSuccess }: RoomDialogProps) {
  const [loading, setLoading] = useState(false);
  const isEdit = !!room;

  const form = useForm<RoomFormData>({
    resolver: zodResolver(RoomSchema),
    defaultValues: {
      roomId: '',
      roomName: '',
      type: 'Classroom',
      capacity: 30,
      availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      hasComputers: false,
      computerCount: 0,
      specialEquipment: '',
    },
  });

  useEffect(() => {
    if (room && isEdit) {
      form.reset({
        roomId: room.roomId,
        roomName: room.roomName,
        type: room.type,
        capacity: room.capacity,
        availableDays: room.availableDays,
        hasComputers: room.hasComputers,
        computerCount: room.computerCount,
        specialEquipment: room.specialEquipment || '',
      });
    } else {
      form.reset({
        roomId: '',
        roomName: '',
        type: 'Classroom',
        capacity: 30,
        availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        hasComputers: false,
        computerCount: 0,
        specialEquipment: '',
      });
    }
  }, [room, isEdit, form, open]);

  async function onSubmit(values: RoomFormData) {
    setLoading(true);
    try {
      const url = isEdit ? `/api/data-management/rooms/${room!.roomId}` : '/api/data-management/rooms';
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save room');
      }

      const result = await response.json();
      toast.success('Success', {
        description: `Room ${isEdit ? 'updated' : 'created'} successfully`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to save room',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Room' : 'Create New Room'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the room details' : 'Add a new room to the system'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Room ID */}
            <FormField
              control={form.control}
              name="roomId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Room ID</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., R101" {...field} disabled={isEdit} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Room Name */}
            <FormField
              control={form.control}
              name="roomName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Room Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Classroom A" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Type and Capacity */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room Type</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-md bg-white dark:bg-slate-950"
                      >
                        {ROOM_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacity</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 30"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Available Days */}
            <FormField
              control={form.control}
              name="availableDays"
              render={() => (
                <FormItem>
                  <FormLabel>Available Days</FormLabel>
                  <div className="grid grid-cols-4 gap-3">
                    {DAYS.map((day) => (
                      <FormField
                        key={day}
                        control={form.control}
                        name="availableDays"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(day)}
                                onCheckedChange={(checked) => {
                                  const updated = checked
                                    ? [...(field.value || []), day]
                                    : (field.value || []).filter((d) => d !== day);
                                  field.onChange(updated);
                                }}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal cursor-pointer">
                              {day.slice(0, 3)}
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Has Computers */}
            <FormField
              control={form.control}
              name="hasComputers"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 space-y-0 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="flex-1">
                    <FormLabel className="text-base font-semibold cursor-pointer">
                      Room has computers
                    </FormLabel>
                    <FormDescription>Enable this if the room is equipped with computers</FormDescription>
                  </div>
                </FormItem>
              )}
            />

            {/* Computer Count */}
            {form.watch('hasComputers') && (
              <FormField
                control={form.control}
                name="computerCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Computers</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 40"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Special Equipment */}
            <FormField
              control={form.control}
              name="specialEquipment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Special Equipment</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Projector, Whiteboard, etc." {...field} />
                  </FormControl>
                  <FormDescription>Comma-separated list of special equipment</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Buttons */}
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : isEdit ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
