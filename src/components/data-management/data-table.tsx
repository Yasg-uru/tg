'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Edit2, Trash2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';

export interface Column<T> {
  key: keyof T;
  label: string;
  render?: (value: any, row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  endpoint: string;
  title: string;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => Promise<void>;
  onCreate?: () => void;
  entityName: string;
  idField: string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  endpoint,
  title,
  onEdit,
  onDelete,
  onCreate,
  entityName,
  idField,
}: DataTableProps<T>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Fetch data
  const fetchData = useCallback(
    async (pageNum: number, searchTerm: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: pageNum.toString(),
          limit: limit.toString(),
          ...(searchTerm && { search: searchTerm }),
        });

        const response = await fetch(`${endpoint}?${params}`, {
          method: 'GET',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }

        const result = await response.json();
        if (result.success) {
          setData(result.data);
          setTotal(result.pagination.total);
          setTotalPages(result.pagination.totalPages);
        }
      } catch (error) {
        toast.error('Error', {
          description: error instanceof Error ? error.message : 'Failed to fetch data',
        });
      } finally {
        setLoading(false);
      }
    },
    [endpoint, limit]
  );

  // Initial load
  useEffect(() => {
    fetchData(1, '');
    setPage(1);
  }, [fetchData]);

  // Search handler
  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value);
      setPage(1);
      fetchData(1, value);
    },
    [fetchData]
  );

  // Delete handler
  const handleDelete = async (row: T) => {
    const id = row[idField as keyof T];
    setDeleting(String(id));

    try {
      if (onDelete) {
        await onDelete(row);
      } else {
        const response = await fetch(`${endpoint}/${id}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error('Failed to delete');
        }

        const result = await response.json();
        if (result.success) {
          toast.success('Success', {
            description: `${entityName} deleted successfully`,
          });
          fetchData(page, search);
        }
      }
    } catch (error) {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to delete',
      });
    } finally {
      setDeleting(null);
    }
  };

  // Pagination handlers
  const handlePrevious = () => {
    if (page > 1) {
      const newPage = page - 1;
      setPage(newPage);
      fetchData(newPage, search);
    }
  };

  const handleNext = () => {
    if (page < totalPages) {
      const newPage = page + 1;
      setPage(newPage);
      fetchData(newPage, search);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with title and create button */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} {entityName}s
          </p>
        </div>
        {onCreate && (
          <Button
            onClick={onCreate}
            size="sm"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            New {entityName}
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`Search ${entityName}s...`}
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow className="hover:bg-muted/60">
              {columns.map((column) => (
                <TableHead key={String(column.key)} className="font-semibold">
                  {column.label}
                </TableHead>
              ))}
              <TableHead className="text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="text-center py-8">
                  <div className="flex justify-center">
                    <div className="animate-spin h-6 w-6 text-muted-foreground" />
                  </div>
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="text-center py-8">
                  <p className="text-muted-foreground">No {entityName}s found</p>
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow
                  key={String(row[idField as keyof T])}
                  className="hover:bg-muted/60 transition-colors"
                >
                  {columns.map((column) => (
                    <TableCell key={String(column.key)} className="text-sm">
                      {column.render
                        ? column.render(row[column.key], row)
                        : String(row[column.key] ?? '-')}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {onEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(row)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(row)}
                          disabled={deleting === String(row[idField as keyof T])}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                        >
                          {deleting === String(row[idField as keyof T]) ? (
                            <div className="animate-spin h-4 w-4" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevious}
                  disabled={page === 1 || loading}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
              </PaginationItem>

              {/* Page numbers */}
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <PaginationItem key={pageNum}>
                  <Button
                    variant={page === pageNum ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setPage(pageNum);
                      fetchData(pageNum, search);
                    }}
                    disabled={loading}
                  >
                    {pageNum}
                  </Button>
                </PaginationItem>
              ))}

              <PaginationItem>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  disabled={page === totalPages || loading}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
